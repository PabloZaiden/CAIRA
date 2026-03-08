/**
 * Deploy one generated deployment strategy to Azure Container Apps with Terraform + ACR.
 *
 * Flow:
 *   1) Detect current public IP via `curl ifconfig.io`
 *   2) Terraform apply phase 1 to deploy the full macro reference-architecture infra with bootstrap app shells
 *   3) Derive strategy .env values from the Terraform outputs
 *   4) Build and push strategy images to ACR
 *   5) Terraform apply phase 2 with the real images and app env
 *
 * Usage:
 *   task strategy:deploy -- deployment-strategies/typescript-foundry-agent-service
 *   task strategy:destroy -- deployment-strategies/typescript-foundry-agent-service
 */

import { execFile, spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import {
  deriveFoundryEndpoint,
  deriveOpenAIEndpoint,
  ensureRbac,
  writeEnvFiles,
  type TerraformOutputs
} from './deploy-reference-architecture.ts';
import {
  buildTestProfileTerraformVars,
  derivePrivateTestOverlayNames,
  deriveProfileProjectName,
  deriveProfileWorkspace,
  isDeployedTestProfile,
  usesCapabilityHost,
  usesPrivateNetworking,
  type DeployedTestProfile
} from './lib/test-profiles.ts';
import { resolveStrategyPath } from './lib/paths.ts';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname ?? '.', '..');
const BASE_REQUIRED_RESOURCE_PROVIDERS = ['Microsoft.App'] as const;
const PRIVATE_REQUIRED_RESOURCE_PROVIDERS = ['Microsoft.Network', 'Microsoft.Compute'] as const;
const ACA_TARGET_PLATFORM = 'linux/amd64';

interface CliOptions {
  strategy: string | undefined;
  location: string;
  allowedCidr: string | undefined;
  projectName: string | undefined;
  destroy: boolean;
  tag: string | undefined;
  testProfile: DeployedTestProfile;
  testProfileSpecified: boolean;
  workspace: string | undefined;
  sshPublicKeyFile: string | undefined;
}

interface ComponentManifest {
  requiredEnv: string[];
  optionalEnv: string[];
}

interface TerraformOutputEntry {
  value: unknown;
}

type TerraformOutputMap = Record<string, TerraformOutputEntry>;

interface DeployVars {
  project_name: string;
  location: string;
  allowed_cidr: string;
  enable_telemetry: boolean;
  enable_registry_auth: boolean;
  agent_image: string;
  api_image: string;
  frontend_image: string;
  agent_env: Record<string, string>;
  api_env: Record<string, string>;
  frontend_env: Record<string, string>;
  tags: Record<string, string>;
}

type DeployTfVars = DeployVars & Record<string, unknown>;

class StreamCommandError extends Error {
  readonly output: string;
  readonly exitCode: number | null;

  constructor(cmd: string, args: string[], exitCode: number | null, output: string) {
    super(`${cmd} ${args.join(' ')} failed with exit code ${String(exitCode)}`);
    this.name = 'StreamCommandError';
    this.output = output;
    this.exitCode = exitCode;
  }
}

function log(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${timestamp}] ${message}\n`);
}

function logError(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stderr.write(`[${timestamp}] ERROR: ${message}\n`);
}

function getExecErrorDetail(error: unknown): string {
  if (
    error instanceof Error &&
    'stderr' in error &&
    typeof error.stderr === 'string' &&
    error.stderr.trim().length > 0
  ) {
    return error.stderr.trim();
  }
  if (
    error instanceof Error &&
    'stdout' in error &&
    typeof error.stdout === 'string' &&
    error.stdout.trim().length > 0
  ) {
    return error.stdout.trim();
  }
  return error instanceof Error ? error.message : String(error);
}

function printUsage(): void {
  process.stdout.write(
    `
Deploy generated sample to Azure Container Apps (Terraform + ACR)
Automatically registers required Azure resource providers (for example Microsoft.App).

Usage:
  task strategy:deploy -- <path>
  task strategy:destroy -- <path>

Options:
  --strategy <path>       Path to deployment strategy directory (required)
  --location <region>     Azure location (default: swedencentral)
  --name <project-name>   Resource naming prefix (default: strategy directory name)
  --allowed-cidr <cidr>   Ingress allowlist CIDR (default: detected from curl ifconfig.io)
  --tag <tag>             Docker image tag (default: timestamp)
  --test-profile <name>   Deployment profile: public, private, private-capability-host
  --workspace <name>      Terraform workspace override (defaults to a profile-specific test workspace)
  --ssh-public-key-file   SSH public key file for the private-profile jumpbox
  --destroy               Destroy deployed strategy resources from Terraform state
  --help, -h              Show help

Examples:
  task strategy:deploy -- deployment-strategies/typescript-foundry-agent-service
  task strategy:deploy -- --test-profile private deployment-strategies/typescript-foundry-agent-service
  task strategy:destroy -- deployment-strategies/typescript-foundry-agent-service

Advanced direct script usage:
  node scripts/deploy-strategy-azure.ts --strategy deployment-strategies/typescript-foundry-agent-service
  node scripts/deploy-strategy-azure.ts --destroy --strategy deployment-strategies/typescript-foundry-agent-service
`.trimStart()
  );
}

function parseArgs(args: string[]): CliOptions | null {
  const options: CliOptions = {
    strategy: undefined,
    location: 'swedencentral',
    allowedCidr: undefined,
    projectName: undefined,
    destroy: false,
    tag: undefined,
    testProfile: 'public',
    testProfileSpecified: false,
    workspace: undefined,
    sshPublicKeyFile: undefined
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    switch (arg) {
      case '--strategy':
        options.strategy = args[++i];
        break;
      case '--location':
        options.location = args[++i] ?? '';
        break;
      case '--allowed-cidr':
        options.allowedCidr = args[++i];
        break;
      case '--name':
        options.projectName = args[++i];
        break;
      case '--tag':
        options.tag = args[++i];
        break;
      case '--test-profile': {
        const value = args[++i]?.trim();
        if (!value || !isDeployedTestProfile(value)) {
          logError(`Unknown test profile: ${value ?? ''}`);
          printUsage();
          return null;
        }
        options.testProfile = value;
        options.testProfileSpecified = true;
        break;
      }
      case '--workspace':
        options.workspace = args[++i];
        break;
      case '--ssh-public-key-file':
        options.sshPublicKeyFile = args[++i];
        break;
      case '--destroy':
        options.destroy = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        if (!arg.startsWith('--') && !options.strategy) {
          options.strategy = arg;
          break;
        }
        logError(`Unknown option: ${arg}`);
        printUsage();
        return null;
    }
  }

  return options;
}

function parseDotEnv(envContent: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = envContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const rawValue = trimmed.slice(eqIndex + 1).trim();
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) || (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;

    if (key) result[key] = value;
  }

  return result;
}

function readComponentManifest(sampleDir: string, component: 'agent' | 'api' | 'frontend'): ComponentManifest {
  const manifestPath = resolve(sampleDir, component, 'component.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing manifest: ${manifestPath}`);
  }
  const raw = readFileSync(manifestPath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<ComponentManifest>;
  return {
    requiredEnv: Array.isArray(parsed.requiredEnv) ? parsed.requiredEnv : [],
    optionalEnv: Array.isArray(parsed.optionalEnv) ? parsed.optionalEnv : []
  };
}

function pickComponentEnv(
  envValues: Record<string, string>,
  manifest: ComponentManifest,
  blocked: ReadonlySet<string>
): Record<string, string> {
  const allowed = new Set([...manifest.requiredEnv, ...manifest.optionalEnv]);
  const selected: Record<string, string> = {};

  for (const [key, value] of Object.entries(envValues)) {
    if (!allowed.has(key)) continue;
    if (blocked.has(key)) continue;
    selected[key] = value;
  }

  return selected;
}

function ensureRequiredEnv(
  component: string,
  manifest: ComponentManifest,
  envMap: Record<string, string>,
  satisfiedByInfra: ReadonlySet<string>
): void {
  const missing = manifest.requiredEnv.filter((key) => !(key in envMap) && !satisfiedByInfra.has(key));
  if (missing.length > 0) {
    throw new Error(
      `${component} missing required env var(s): ${missing.join(', ')}. ` +
        'Could not find expected values in sample .env after CAIRA env generation.'
    );
  }
}

async function runCapture(
  cmd: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number }
): Promise<string> {
  const result = await execFileAsync(cmd, args, {
    cwd: options?.cwd,
    timeout: options?.timeoutMs ?? 120_000,
    maxBuffer: 20 * 1024 * 1024
  });
  return result.stdout;
}

async function runStream(cmd: string, args: string[], options?: { cwd?: string; stdin?: string }): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, {
      cwd: options?.cwd,
      stdio: options?.stdin !== undefined ? ['pipe', 'inherit', 'inherit'] : 'inherit'
    });

    child.on('error', (err) => rejectPromise(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`${cmd} ${args.join(' ')} failed with exit code ${String(code)}`));
    });

    if (options?.stdin !== undefined) {
      child.stdin?.end(options.stdin);
    }
  });
}

async function runStreamWithOutput(
  cmd: string,
  args: string[],
  options?: { cwd?: string; stdin?: string }
): Promise<string> {
  return new Promise<string>((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, {
      cwd: options?.cwd,
      stdio: options?.stdin !== undefined ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe']
    });

    let output = '';

    child.stdout?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });

    child.on('error', (err) => rejectPromise(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolvePromise(output);
        return;
      }
      rejectPromise(new StreamCommandError(cmd, args, code, output));
    });

    if (options?.stdin !== undefined) {
      child.stdin?.end(options.stdin);
    }
  });
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function listTerraformStateResources(infraDir: string): Promise<string[]> {
  try {
    const raw = await runCapture('terraform', ['state', 'list'], {
      cwd: infraDir,
      timeoutMs: 30_000
    });
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch (error) {
    const detail = getExecErrorDetail(error);
    if (detail.includes('No state file was found')) {
      return [];
    }
    throw error;
  }
}

async function subnetExists(
  resourceGroupName: string,
  virtualNetworkName: string,
  subnetName: string
): Promise<boolean> {
  const raw = await runCapture(
    'az',
    [
      'network',
      'vnet',
      'subnet',
      'list',
      '--resource-group',
      resourceGroupName,
      '--vnet-name',
      virtualNetworkName,
      '--query',
      `[?name=='${subnetName}'].name`,
      '-o',
      'tsv'
    ],
    { timeoutMs: 30_000 }
  );

  return raw
    .split('\n')
    .map((line) => line.trim())
    .includes(subnetName);
}

async function deleteLingeringSubnet(
  resourceGroupName: string,
  virtualNetworkName: string,
  subnetName: string
): Promise<void> {
  if (!(await subnetExists(resourceGroupName, virtualNetworkName, subnetName))) {
    return;
  }

  log(`Deleting lingering private test subnet ${subnetName}...`);
  try {
    await runCapture(
      'az',
      [
        'network',
        'vnet',
        'subnet',
        'delete',
        '--resource-group',
        resourceGroupName,
        '--vnet-name',
        virtualNetworkName,
        '--name',
        subnetName
      ],
      { timeoutMs: 120_000 }
    );
  } catch (error) {
    throw new Error(`Failed to delete lingering private test subnet "${subnetName}": ${getExecErrorDetail(error)}`);
  }

  for (let attempt = 0; attempt < 60; attempt++) {
    if (!(await subnetExists(resourceGroupName, virtualNetworkName, subnetName))) {
      return;
    }
    await sleep(5_000);
  }

  throw new Error(`Timed out waiting for lingering private test subnet "${subnetName}" to be deleted`);
}

async function cleanupOrphanedPrivateTestSubnets(
  projectName: string,
  profile: DeployedTestProfile,
  profileVars: Record<string, unknown>
): Promise<void> {
  const poolResourceGroupName = profileVars['testing_private_pool_resource_group_name'];
  const virtualNetworkName = profileVars['testing_private_pool_vnet_name'];
  if (typeof poolResourceGroupName !== 'string' || typeof virtualNetworkName !== 'string') {
    return;
  }

  const overlayNames = derivePrivateTestOverlayNames(projectName, profile);
  const candidateSubnets = [overlayNames.containerAppsSubnetName];

  if (typeof profileVars['testing_private_jumpbox_subnet_cidr'] === 'string') {
    candidateSubnets.push(overlayNames.jumpboxSubnetName);
  }
  if (usesCapabilityHost(profile) && typeof profileVars['testing_private_agents_subnet_cidr'] === 'string') {
    candidateSubnets.push(overlayNames.agentsSubnetName);
  }

  let foundLingeringSubnet = false;
  for (const subnetName of candidateSubnets) {
    if (await subnetExists(poolResourceGroupName, virtualNetworkName, subnetName)) {
      foundLingeringSubnet = true;
      break;
    }
  }

  if (!foundLingeringSubnet) {
    return;
  }

  log('Found lingering private test subnets without Terraform state; cleaning them up before deploy...');
  for (const subnetName of candidateSubnets) {
    await deleteLingeringSubnet(poolResourceGroupName, virtualNetworkName, subnetName);
  }
}

function isRetryableTerraformApplyError(error: unknown): error is StreamCommandError {
  return error instanceof StreamCommandError && error.output.includes('IfMatchPreconditionFailed');
}

function isRetryableTerraformDestroyError(error: unknown): error is StreamCommandError {
  return (
    error instanceof StreamCommandError &&
    error.output.includes('RequestConflict') &&
    error.output.includes('provisioning state is not terminal')
  );
}

async function runTerraformApplyWithRetry(infraDir: string, tfVarsPath: string): Promise<void> {
  const baseArgs = ['apply', '-auto-approve', '-input=false', '-var-file', tfVarsPath];

  try {
    await runStreamWithOutput('terraform', baseArgs, { cwd: infraDir });
  } catch (error) {
    if (!isRetryableTerraformApplyError(error)) {
      throw error;
    }

    log('Terraform apply hit an Azure If-Match precondition failure. Retrying once with -parallelism=1...');
    await sleep(15_000);
    await runStreamWithOutput(
      'terraform',
      ['apply', '-parallelism=1', '-auto-approve', '-input=false', '-var-file', tfVarsPath],
      { cwd: infraDir }
    );
  }
}

async function runTerraformDestroyWithRetry(infraDir: string, tfVarsPath: string): Promise<void> {
  const baseArgs = ['destroy', '-auto-approve', '-input=false', '-var-file', tfVarsPath];
  const maxAttempts = 5;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await runStreamWithOutput('terraform', baseArgs, { cwd: infraDir });
      return;
    } catch (error) {
      if (!isRetryableTerraformDestroyError(error) || attempt === maxAttempts) {
        throw error;
      }

      const waitSeconds = attempt * 30;
      log(
        `Terraform destroy hit an Azure RequestConflict while waiting for a resource to reach a terminal state. Retrying in ${String(waitSeconds)}s...`
      );
      await sleep(waitSeconds * 1_000);
    }
  }
}

function requireOutputString(outputs: TerraformOutputMap, key: string): string {
  const value = outputs[key]?.value;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Terraform output "${key}" is missing or not a string`);
  }
  return value;
}

function normalizeSampleName(sampleName: string): string {
  return sampleName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

function generateDefaultTag(): string {
  return new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, '')
    .slice(0, 14);
}

async function ensureProviderRegistered(namespace: string): Promise<void> {
  const currentState = (
    await runCapture(
      'az',
      ['provider', 'show', '--namespace', namespace, '--query', 'registrationState', '-o', 'tsv'],
      { timeoutMs: 30_000 }
    )
  ).trim();

  if (currentState.toLowerCase() === 'registered') {
    log(`Azure provider ${namespace} is already registered.`);
    return;
  }

  log(`Registering Azure provider ${namespace} (current state: ${currentState || 'unknown'})...`);
  await runStream('az', ['provider', 'register', '--namespace', namespace, '--wait'], {
    cwd: REPO_ROOT
  });

  const finalState = (
    await runCapture(
      'az',
      ['provider', 'show', '--namespace', namespace, '--query', 'registrationState', '-o', 'tsv'],
      { timeoutMs: 30_000 }
    )
  ).trim();

  if (finalState.toLowerCase() !== 'registered') {
    throw new Error(`Azure provider ${namespace} is not registered (state: ${finalState || 'unknown'})`);
  }

  log(`Azure provider ${namespace} registered.`);
}

async function ensureRequiredProvidersRegistered(profile: DeployedTestProfile): Promise<void> {
  const namespaces = usesPrivateNetworking(profile)
    ? [...BASE_REQUIRED_RESOURCE_PROVIDERS, ...PRIVATE_REQUIRED_RESOURCE_PROVIDERS]
    : [...BASE_REQUIRED_RESOURCE_PROVIDERS];

  for (const namespace of namespaces) {
    await ensureProviderRegistered(namespace);
  }
}

async function listTerraformWorkspaces(infraDir: string): Promise<string[]> {
  const raw = await runCapture('terraform', ['workspace', 'list'], {
    cwd: infraDir,
    timeoutMs: 30_000
  });
  return raw
    .split('\n')
    .map((line) => line.replace(/^\*\s*/, '').trim())
    .filter((line) => line.length > 0);
}

async function ensureWorkspaceSelected(
  infraDir: string,
  workspace: string,
  options?: { createIfMissing?: boolean | undefined }
): Promise<void> {
  const trimmed = workspace.trim();
  if (!trimmed || trimmed === 'default') {
    return;
  }

  const existing = await listTerraformWorkspaces(infraDir);
  if (existing.includes(trimmed)) {
    await runCapture('terraform', ['workspace', 'select', trimmed], { cwd: infraDir, timeoutMs: 30_000 });
    return;
  }

  if (options?.createIfMissing) {
    await runStream('terraform', ['workspace', 'new', trimmed], { cwd: infraDir });
    return;
  }

  throw new Error(`Terraform workspace "${trimmed}" does not exist in ${infraDir}`);
}

async function cleanupWorkspace(infraDir: string, workspace: string): Promise<void> {
  const trimmed = workspace.trim();
  if (!trimmed || trimmed === 'default') {
    return;
  }

  const existing = await listTerraformWorkspaces(infraDir);
  if (!existing.includes(trimmed)) {
    return;
  }

  await runStream('terraform', ['workspace', 'select', 'default'], { cwd: infraDir });
  await runStream('terraform', ['workspace', 'delete', trimmed], { cwd: infraDir });
}

function readJumpboxPublicKey(filePath: string | undefined): string | undefined {
  const trimmedPath = filePath?.trim();
  if (!trimmedPath) {
    return undefined;
  }

  const resolvedPath = resolve(trimmedPath);
  if (!existsSync(resolvedPath)) {
    throw new Error(`SSH public key file not found: ${resolvedPath}`);
  }

  const value = readFileSync(resolvedPath, 'utf-8').trim();
  if (!value) {
    throw new Error(`SSH public key file is empty: ${resolvedPath}`);
  }

  return value;
}

function sanitizeLabelForFileName(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_.-]/g, '-');
  return sanitized.length > 0 ? sanitized : 'default';
}

async function detectCurrentCidr(override: string | undefined): Promise<string> {
  if (override && override.trim().length > 0) return override.trim();

  const raw = await runCapture('curl', ['-fsS', 'ifconfig.io'], { timeoutMs: 15_000 });
  const ip = raw.trim();
  if (!ip) {
    throw new Error('Could not detect current IP from curl ifconfig.io');
  }
  return ip.includes(':') ? `${ip}/128` : `${ip}/32`;
}

async function readTerraformOutputs(infraDir: string): Promise<TerraformOutputMap> {
  const raw = await runCapture('terraform', ['output', '-json'], {
    cwd: infraDir,
    timeoutMs: 30_000
  });
  return JSON.parse(raw) as TerraformOutputMap;
}

function toReferenceOutputs(outputs: TerraformOutputMap): TerraformOutputs {
  return {
    ai_foundry_name: requireOutputString(outputs, 'ai_foundry_name'),
    ai_foundry_default_project_name: requireOutputString(outputs, 'ai_foundry_default_project_name'),
    ai_foundry_id: requireOutputString(outputs, 'ai_foundry_id')
  };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    process.exit(1);
  }

  if (!parsed.strategy) {
    logError('--strategy <path> is required');
    printUsage();
    process.exit(1);
  }

  const sampleDir = resolveStrategyPath(parsed.strategy);
  const sampleName = basename(sampleDir);
  const infraDir = resolve(sampleDir, 'infra');
  const envPath = resolve(sampleDir, '.env');

  if (!existsSync(sampleDir)) {
    throw new Error(`Sample directory not found: ${sampleDir}`);
  }
  if (!existsSync(infraDir)) {
    throw new Error(`Sample infra directory not found: ${infraDir}. Run task strategy:generate first.`);
  }

  const workspace =
    parsed.workspace?.trim() ||
    (parsed.testProfileSpecified ? deriveProfileWorkspace(sampleName, parsed.testProfile) : undefined);
  const projectName =
    parsed.projectName?.trim() ||
    (parsed.testProfileSpecified || workspace ? deriveProfileProjectName(sampleName, parsed.testProfile) : sampleName);
  const tag = parsed.tag?.trim() || generateDefaultTag();
  const jumpboxSshPublicKey = readJumpboxPublicKey(parsed.sshPublicKeyFile);

  if (!parsed.destroy) {
    log('Ensuring required Azure resource providers are registered...');
    await ensureRequiredProvidersRegistered(parsed.testProfile);
  }

  const allowedCidr = parsed.destroy
    ? (parsed.allowedCidr ?? '127.0.0.1/32')
    : await detectCurrentCidr(parsed.allowedCidr);
  log(`Using ingress CIDR allowlist: ${allowedCidr}`);
  log(`Using deployment profile: ${parsed.testProfile}`);
  if (workspace) {
    log(`Using terraform workspace: ${workspace}`);
  }

  const profileVars = await buildTestProfileTerraformVars({
    profile: parsed.testProfile,
    strategyName: sampleName,
    projectName,
    location: parsed.location,
    resolveJumpboxVmSize: !parsed.destroy,
    includeJumpbox: !parsed.destroy,
    jumpboxAllowedCidr: allowedCidr,
    jumpboxSshPublicKey,
    strategiesRoot: resolve(REPO_ROOT, '..', 'deployment-strategies')
  });

  const tfVarsPath = resolve(
    infraDir,
    workspace ? `.deploy.${sanitizeLabelForFileName(workspace)}.auto.tfvars.json` : '.deploy.auto.tfvars.json'
  );
  const baseVars: DeployTfVars = {
    project_name: projectName,
    location: parsed.location,
    allowed_cidr: allowedCidr,
    enable_telemetry: true,
    enable_registry_auth: false,
    agent_image: '',
    api_image: '',
    frontend_image: '',
    agent_env: {},
    api_env: {},
    frontend_env: {},
    tags: {
      sample: sampleName,
      deployment_profile: parsed.testProfile,
      managed_by: 'deploy-strategy-azure.ts'
    },
    ...profileVars
  };

  await writeFile(tfVarsPath, JSON.stringify(baseVars, null, 2));

  try {
    log('Terraform init...');
    await runStream('terraform', ['init', '-input=false'], { cwd: infraDir });
    if (workspace) {
      await ensureWorkspaceSelected(infraDir, workspace, { createIfMissing: !parsed.destroy });
    }
    if (!parsed.destroy && usesPrivateNetworking(parsed.testProfile)) {
      const stateResources = await listTerraformStateResources(infraDir);
      if (stateResources.length === 0) {
        await cleanupOrphanedPrivateTestSubnets(projectName, parsed.testProfile, profileVars);
      }
    }

    if (parsed.destroy) {
      log('Terraform destroy...');
      await runTerraformDestroyWithRetry(infraDir, tfVarsPath);
      if (workspace) {
        await cleanupWorkspace(infraDir, workspace);
      }
      log('Destroy complete.');
      return;
    }

    log('Terraform apply phase 1 (macro reference architecture infra + bootstrap app shells)...');
    await runTerraformApplyWithRetry(infraDir, tfVarsPath);
    if (workspace) {
      await ensureWorkspaceSelected(infraDir, workspace, { createIfMissing: false });
    }

    const agentManifest = readComponentManifest(sampleDir, 'agent');
    const apiManifest = readComponentManifest(sampleDir, 'api');
    const frontendManifest = readComponentManifest(sampleDir, 'frontend');

    const blockedAgent = new Set(['PORT', 'HOST', 'SKIP_AUTH', 'IDENTITY_ENDPOINT', 'IMDS_ENDPOINT']);
    const blockedApi = new Set([
      'PORT',
      'HOST',
      'SKIP_AUTH',
      'IDENTITY_ENDPOINT',
      'IMDS_ENDPOINT',
      'AGENT_SERVICE_URL'
    ]);
    const blockedFrontend = new Set(['PORT', 'API_BASE_URL']);

    const phase1Outputs = await readTerraformOutputs(infraDir);
    const referenceOutputs = toReferenceOutputs(phase1Outputs);
    const foundryEndpoint = deriveFoundryEndpoint(referenceOutputs);
    const openaiEndpoint = deriveOpenAIEndpoint(referenceOutputs);
    log(`Foundry endpoint: ${foundryEndpoint}`);
    log(`OpenAI endpoint:  ${openaiEndpoint}`);
    await writeEnvFiles(referenceOutputs, sampleDir);
    await ensureRbac(referenceOutputs.ai_foundry_id);

    const envValues = existsSync(envPath) ? parseDotEnv(readFileSync(envPath, 'utf-8')) : {};
    const agentEnv = pickComponentEnv(envValues, agentManifest, blockedAgent);
    const apiEnv = pickComponentEnv(envValues, apiManifest, blockedApi);
    const frontendEnv = pickComponentEnv(envValues, frontendManifest, blockedFrontend);

    ensureRequiredEnv('agent', agentManifest, agentEnv, new Set());
    ensureRequiredEnv('api', apiManifest, apiEnv, new Set(['AGENT_SERVICE_URL']));
    ensureRequiredEnv('frontend', frontendManifest, frontendEnv, new Set(['API_BASE_URL']));

    const acrName = requireOutputString(phase1Outputs, 'acr_name');
    const loginServer = requireOutputString(phase1Outputs, 'acr_login_server');

    const imagePrefix = `${loginServer}/${normalizeSampleName(sampleName)}`;
    const agentImage = `${imagePrefix}/agent:${tag}`;
    const apiImage = `${imagePrefix}/api:${tag}`;
    const frontendImage = `${imagePrefix}/frontend:${tag}`;

    log('Waiting 60s for RBAC propagation before rolling out private images...');
    await sleep(60_000);

    log(`Logging in to ACR ${acrName} using Azure CLI...`);
    await runStream('az', ['acr', 'login', '--name', acrName], { cwd: REPO_ROOT });

    const builds: Array<{ name: string; image: string; context: string }> = [
      { name: 'agent', image: agentImage, context: resolve(sampleDir, 'agent') },
      { name: 'api', image: apiImage, context: resolve(sampleDir, 'api') },
      { name: 'frontend', image: frontendImage, context: resolve(sampleDir, 'frontend') }
    ];

    for (const build of builds) {
      log(`Building ${build.name} image for ${ACA_TARGET_PLATFORM}...`);
      await runStream('docker', ['build', '--platform', ACA_TARGET_PLATFORM, '-t', build.image, build.context], {
        cwd: REPO_ROOT
      });
      log(`Pushing ${build.name} image...`);
      await runStream('docker', ['push', build.image], { cwd: REPO_ROOT });
    }

    const finalVars: DeployTfVars = {
      ...baseVars,
      enable_registry_auth: true,
      agent_image: agentImage,
      api_image: apiImage,
      frontend_image: frontendImage,
      agent_env: agentEnv,
      api_env: apiEnv,
      frontend_env: frontendEnv
    };
    await writeFile(tfVarsPath, JSON.stringify(finalVars, null, 2));

    log('Terraform apply phase 2 (container apps with pushed images)...');
    await runTerraformApplyWithRetry(infraDir, tfVarsPath);

    const finalOutputs = await readTerraformOutputs(infraDir);
    const frontendUrl = requireOutputString(finalOutputs, 'frontend_url');

    log('Deployment complete.');
    log(`Frontend URL: ${frontendUrl}`);
  } finally {
    await rm(tfVarsPath, { force: true });
  }
}

main().catch((err: unknown) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
