/**
 * Deploy one generated deployment strategy to Azure Container Apps with Terraform + ACR.
 *
 * Flow:
 *   1) Ensure CAIRA is deployed/reused and write strategy .env
 *   2) Detect current public IP via `curl ifconfig.io`
 *   3) Terraform apply (shared infra only) to create RG/ACA env/ACR
 *   4) Terraform apply bootstrap apps with public image to create system identities + RBAC
 *   5) Build and push strategy images to ACR
 *   6) Terraform apply with concrete image tags (updates bootstrap apps)
 *
 * Usage:
 *   node scripts/deploy-strategy-azure.ts --strategy deployment-strategies/typescript-foundry-agent-service
 *   node scripts/deploy-strategy-azure.ts --strategy deployment-strategies/typescript-foundry-agent-service --destroy
 */

import { execFile, spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ensureDeploy } from './deploy-reference-architecture.ts';
import { resolveStrategyPath } from './lib/paths.ts';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname ?? '.', '..');
const REQUIRED_RESOURCE_PROVIDERS = ['Microsoft.App'] as const;
const ACA_TARGET_PLATFORM = 'linux/amd64';
const BOOTSTRAP_IMAGE = 'mcr.microsoft.com/k8se/quickstart:latest';

interface CliOptions {
  strategy: string | undefined;
  location: string;
  allowedCidr: string | undefined;
  projectName: string | undefined;
  aiResourceId: string | undefined;
  forceDeploy: boolean;
  destroy: boolean;
  tag: string | undefined;
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
  ai_resource_id: string;
  deploy_apps: boolean;
  enable_registry_auth: boolean;
  agent_image: string;
  api_image: string;
  frontend_image: string;
  agent_env: Record<string, string>;
  api_env: Record<string, string>;
  frontend_env: Record<string, string>;
  tags: Record<string, string>;
}

function log(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${timestamp}] ${message}\n`);
}

function logError(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stderr.write(`[${timestamp}] ERROR: ${message}\n`);
}

function printUsage(): void {
  process.stdout.write(
    `
Deploy generated sample to Azure Container Apps (Terraform + ACR)
Automatically ensures CAIRA deployment and writes strategy .env values first.
Automatically registers required Azure resource providers (for example Microsoft.App).

Usage:
  node scripts/deploy-strategy-azure.ts --strategy <path> [options]

Options:
  --strategy <path>       Path to deployment strategy directory (required)
  --location <region>     Azure location (default: swedencentral)
  --name <project-name>   Resource naming prefix (default: strategy directory name)
  --force-deploy          Force CAIRA terraform apply before writing strategy .env
  --ai-resource-id <id>   Azure AI/Cognitive Services resource ID (optional auto-detected)
  --allowed-cidr <cidr>   Ingress allowlist CIDR (default: detected from curl ifconfig.io)
  --tag <tag>             Docker image tag (default: timestamp)
  --destroy               Destroy deployed strategy resources from Terraform state
  --help, -h              Show help

Examples:
  npm run deploy:strategy -- deployment-strategies/typescript-foundry-agent-service
  npm run deploy:strategy:destroy -- deployment-strategies/typescript-foundry-agent-service
`.trimStart()
  );
}

function parseArgs(args: string[]): CliOptions | null {
  const options: CliOptions = {
    strategy: undefined,
    location: 'swedencentral',
    allowedCidr: undefined,
    projectName: undefined,
    aiResourceId: undefined,
    forceDeploy: false,
    destroy: false,
    tag: undefined
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
      case '--force-deploy':
        options.forceDeploy = true;
        break;
      case '--ai-resource-id':
        options.aiResourceId = args[++i];
        break;
      case '--tag':
        options.tag = args[++i];
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

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
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

async function ensureRequiredProvidersRegistered(): Promise<void> {
  for (const namespace of REQUIRED_RESOURCE_PROVIDERS) {
    await ensureProviderRegistered(namespace);
  }
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

function extractAiResourceName(agentEnv: Record<string, string>): string | null {
  const endpoint = agentEnv['AZURE_AI_PROJECT_ENDPOINT'] ?? agentEnv['AZURE_OPENAI_ENDPOINT'];
  if (!endpoint) return null;

  try {
    const hostname = new URL(endpoint).hostname;
    const name = hostname.split('.')[0]?.trim() ?? '';
    return name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

async function resolveAiResourceId(agentEnv: Record<string, string>): Promise<string | null> {
  const resourceName = extractAiResourceName(agentEnv);
  if (!resourceName) return null;

  const raw = await runCapture(
    'az',
    [
      'resource',
      'list',
      '--name',
      resourceName,
      '--resource-type',
      'Microsoft.CognitiveServices/accounts',
      '--query',
      '[0].id',
      '-o',
      'tsv'
    ],
    { timeoutMs: 30_000 }
  );
  const id = raw.trim();
  return id.length > 0 ? id : null;
}

async function readTerraformOutputs(infraDir: string): Promise<TerraformOutputMap> {
  const raw = await runCapture('terraform', ['output', '-json'], {
    cwd: infraDir,
    timeoutMs: 30_000
  });
  return JSON.parse(raw) as TerraformOutputMap;
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
    throw new Error(`Sample infra directory not found: ${infraDir}. Run npm run generate first.`);
  }

  const projectName = parsed.projectName?.trim() || sampleName;
  const tag = parsed.tag?.trim() || generateDefaultTag();

  if (!parsed.destroy) {
    log('Ensuring CAIRA deployment and strategy .env...');
    await ensureDeploy({ strategy: sampleDir, force: parsed.forceDeploy });
    log('Ensuring required Azure resource providers are registered...');
    await ensureRequiredProvidersRegistered();
  }

  const envValues = existsSync(envPath) ? parseDotEnv(readFileSync(envPath, 'utf-8')) : {};
  const agentManifest = readComponentManifest(sampleDir, 'agent');
  const apiManifest = readComponentManifest(sampleDir, 'api');
  const frontendManifest = readComponentManifest(sampleDir, 'frontend');

  const blockedAgent = new Set(['PORT', 'HOST', 'SKIP_AUTH', 'IDENTITY_ENDPOINT', 'IMDS_ENDPOINT']);
  const blockedApi = new Set(['PORT', 'HOST', 'SKIP_AUTH', 'IDENTITY_ENDPOINT', 'IMDS_ENDPOINT', 'AGENT_SERVICE_URL']);
  const blockedFrontend = new Set(['PORT', 'API_BASE_URL']);

  const agentEnv = pickComponentEnv(envValues, agentManifest, blockedAgent);
  const apiEnv = pickComponentEnv(envValues, apiManifest, blockedApi);
  const frontendEnv = pickComponentEnv(envValues, frontendManifest, blockedFrontend);

  if (!parsed.destroy) {
    ensureRequiredEnv('agent', agentManifest, agentEnv, new Set());
    ensureRequiredEnv('api', apiManifest, apiEnv, new Set(['AGENT_SERVICE_URL']));
    ensureRequiredEnv('frontend', frontendManifest, frontendEnv, new Set(['API_BASE_URL']));
  }

  let aiResourceId = parsed.aiResourceId?.trim() ?? '';
  if (!parsed.destroy && aiResourceId.length === 0) {
    log('Resolving Azure AI resource ID from agent endpoint...');
    aiResourceId = (await resolveAiResourceId(agentEnv)) ?? '';
  }
  if (!parsed.destroy && aiResourceId.length === 0) {
    throw new Error('Could not resolve Azure AI resource ID automatically. Pass --ai-resource-id <resourceId>.');
  }

  const allowedCidr = parsed.destroy
    ? (parsed.allowedCidr ?? '127.0.0.1/32')
    : await detectCurrentCidr(parsed.allowedCidr);
  log(`Using ingress CIDR allowlist: ${allowedCidr}`);

  const tfVarsPath = resolve(infraDir, '.deploy.auto.tfvars.json');
  const baseVars: DeployVars = {
    project_name: projectName,
    location: parsed.location,
    allowed_cidr: allowedCidr,
    ai_resource_id: aiResourceId,
    deploy_apps: false,
    enable_registry_auth: true,
    agent_image: '',
    api_image: '',
    frontend_image: '',
    agent_env: agentEnv,
    api_env: apiEnv,
    frontend_env: frontendEnv,
    tags: {
      sample: sampleName,
      managed_by: 'deploy-strategy-azure.ts'
    }
  };

  await writeFile(tfVarsPath, JSON.stringify(baseVars, null, 2));

  log('Terraform init...');
  await runStream('terraform', ['init', '-input=false'], { cwd: infraDir });

  if (parsed.destroy) {
    log('Terraform destroy...');
    await runStream('terraform', ['destroy', '-auto-approve', '-input=false', '-var-file', tfVarsPath], {
      cwd: infraDir
    });
    log('Destroy complete.');
    return;
  }

  log('Terraform apply phase 1 (shared infra + ACR)...');
  await runStream('terraform', ['apply', '-auto-approve', '-input=false', '-var-file', tfVarsPath], { cwd: infraDir });

  const phase1Outputs = await readTerraformOutputs(infraDir);
  const acrName = requireOutputString(phase1Outputs, 'acr_name');
  const loginServer = requireOutputString(phase1Outputs, 'acr_login_server');

  const imagePrefix = `${loginServer}/${normalizeSampleName(sampleName)}`;
  const agentImage = `${imagePrefix}/agent:${tag}`;
  const apiImage = `${imagePrefix}/api:${tag}`;
  const frontendImage = `${imagePrefix}/frontend:${tag}`;

  const bootstrapVars: DeployVars = {
    ...baseVars,
    deploy_apps: true,
    enable_registry_auth: false,
    agent_image: BOOTSTRAP_IMAGE,
    api_image: BOOTSTRAP_IMAGE,
    frontend_image: BOOTSTRAP_IMAGE
  };
  await writeFile(tfVarsPath, JSON.stringify(bootstrapVars, null, 2));

  log('Terraform apply phase 2 (bootstrap apps for identity/RBAC setup)...');
  await runStream('terraform', ['apply', '-auto-approve', '-input=false', '-var-file', tfVarsPath], { cwd: infraDir });

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

  const finalVars: DeployVars = {
    ...baseVars,
    deploy_apps: true,
    enable_registry_auth: true,
    agent_image: agentImage,
    api_image: apiImage,
    frontend_image: frontendImage
  };
  await writeFile(tfVarsPath, JSON.stringify(finalVars, null, 2));

  log('Terraform apply phase 3 (container apps with pushed images)...');
  await runStream('terraform', ['apply', '-auto-approve', '-input=false', '-var-file', tfVarsPath], { cwd: infraDir });

  const finalOutputs = await readTerraformOutputs(infraDir);
  const frontendUrl = requireOutputString(finalOutputs, 'frontend_url');

  log('Deployment complete.');
  log(`Frontend URL: ${frontendUrl}`);
}

main().catch((err: unknown) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
