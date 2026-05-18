import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { promisify } from 'node:util';
import { log, logError, waitForHealthy } from './lib/compose-helpers.ts';
import {
  deriveFoundryEndpoint,
  deriveOpenAIEndpoint,
  type TerraformOutputs as ReferenceTerraformOutputs
} from './deploy-reference-architecture.ts';
import { resolveStrategyPath } from './lib/paths.ts';
import {
  buildPrivateE2ECommand,
  buildPrivateFrontendHealthCommand,
  deriveDeepHealthUrl
} from './lib/private-test-commands.ts';
import {
  DEPLOYED_TEST_PROFILES,
  deriveProfileProjectName,
  deriveProfileWorkspace,
  parseDeployedTestProfiles,
  requiresJumpbox,
  usesCapabilityHost,
  usesPrivateNetworking,
  type DeployedTestProfile
} from './lib/test-profiles.ts';
import {
  copyDirectoryToJumpbox,
  createTemporarySshKeyPair,
  runJumpboxBashScript,
  waitForJumpboxSsh,
  type TemporarySshKeyPair
} from './lib/jumpbox.ts';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(import.meta.dirname ?? '.', '..');
const DEPLOY_SCRIPT = resolve(REPO_ROOT, 'scripts', 'deploy-strategy-azure.ts');
const E2E_DIR = resolve(REPO_ROOT, 'testing', 'e2e');

interface CliOptions {
  strategy: string | undefined;
  keepDeployed: boolean;
  location: string | undefined;
  allowedCidr: string | undefined;
  projectName: string | undefined;
  tag: string | undefined;
  testProfiles: DeployedTestProfile[];
  enableApimAiGateway: boolean;
  apimSkuName: string | undefined;
}

interface TerraformOutputEntry {
  value: unknown;
}

type TerraformOutputMap = Record<string, TerraformOutputEntry>;

interface ComponentManifest {
  requiredEnv?: string[];
  optionalEnv?: string[];
}

interface CapabilityHostResponse {
  name?: string;
  properties?: {
    vectorStoreConnections?: string[];
    storageConnections?: string[];
    threadStorageConnections?: string[];
  };
}

interface ListConnectionsResponse {
  value?: Array<{ name?: string }>;
}

interface JumpboxTarget {
  host: string;
  username: string;
  privateKeyPath: string;
}

function printUsage(): void {
  process.stdout.write(
    `
Test deployed Azure Container Apps strategies across public and private validation profiles

Usage:
  task strategy:test:deployed -- <path>

Options:
  --strategy <path>         Path or name of the deployment strategy directory (required)
  --test-profile <name>     One or more profiles (${DEPLOYED_TEST_PROFILES.join(', ')}). Repeat or pass comma-separated values.
  --keep-deployed           Skip destroy after validation
  --location <region>       Azure region override
  --allowed-cidr <cidr>     Ingress/jumpbox CIDR override
  --name <project-name>     Resource naming prefix override (single-profile runs only)
  --tag <tag>               Image tag override
  --enable-apim-ai-gateway  Deploy the optional APIM AI gateway and verify OpenAI-compatible agents route through it
  --apim-sku-name <sku>     APIM SKU when the AI gateway is enabled (default: Developer_1)
  --help, -h                Show help

Advanced direct script usage:
  node scripts/test-deployed-strategy.ts --strategy deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
  node scripts/test-deployed-strategy.ts --strategy deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca --test-profile private
`.trimStart()
  );
}

function parseArgs(args: string[]): CliOptions | null {
  const requestedProfiles: string[] = [];
  const options: CliOptions = {
    strategy: undefined,
    keepDeployed: false,
    location: undefined,
    allowedCidr: undefined,
    projectName: undefined,
    tag: undefined,
    testProfiles: [...DEPLOYED_TEST_PROFILES],
    enableApimAiGateway: false,
    apimSkuName: undefined
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    switch (arg) {
      case '--strategy':
        options.strategy = args[++i];
        break;
      case '--test-profile':
        requestedProfiles.push(args[++i] ?? '');
        break;
      case '--keep-deployed':
        options.keepDeployed = true;
        break;
      case '--location':
        options.location = args[++i];
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
      case '--enable-apim-ai-gateway':
        options.enableApimAiGateway = true;
        break;
      case '--apim-sku-name':
        options.apimSkuName = args[++i];
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

  if (!options.strategy) {
    logError('--strategy <path> is required');
    printUsage();
    return null;
  }

  try {
    options.testProfiles = parseDeployedTestProfiles(requestedProfiles);
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error));
    return null;
  }

  if (options.keepDeployed && options.testProfiles.length !== 1) {
    logError('--keep-deployed can only be used with a single --test-profile value');
    return null;
  }

  if (options.projectName && options.testProfiles.length !== 1) {
    logError('--name can only be used with a single --test-profile value');
    return null;
  }

  return options;
}

async function runStreaming(command: string, args: string[], cwd: string, env?: Record<string, string>): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: 'inherit'
    });

    child.on('error', rejectPromise);
    child.on('exit', (code, signal) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(
        new Error(`${command} ${args.join(' ')} failed with ${signal ? `signal ${signal}` : `exit code ${code ?? 1}`}`)
      );
    });
  });
}

async function runCapture(command: string, args: string[], cwd: string, timeoutMs = 120_000): Promise<string> {
  const result = await execFileAsync(command, args, {
    cwd,
    timeout: timeoutMs,
    maxBuffer: 20 * 1024 * 1024
  });
  return result.stdout;
}

async function ensureE2EDependencies(): Promise<void> {
  if (!existsSync(resolve(E2E_DIR, 'node_modules'))) {
    log('Installing E2E test dependencies...');
    await runStreaming('npm', ['install'], E2E_DIR);
  }
}

async function readTerraformOutputs(infraDir: string): Promise<TerraformOutputMap> {
  const raw = await runCapture('terraform', ['output', '-json'], infraDir, 30_000);
  return JSON.parse(raw) as TerraformOutputMap;
}

function requireOutputString(outputs: TerraformOutputMap, key: string): string {
  const value = outputs[key]?.value;
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Terraform output "${key}" is missing or not a string`);
  }
  return value;
}

function readOptionalOutputString(outputs: TerraformOutputMap, key: string): string | undefined {
  const value = outputs[key]?.value;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalOutputStringArray(outputs: TerraformOutputMap, key: string): string[] {
  const value = outputs[key]?.value;
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function toReferenceOutputs(outputs: TerraformOutputMap): ReferenceTerraformOutputs {
  return {
    ai_foundry_name: requireOutputString(outputs, 'ai_foundry_name'),
    ai_foundry_default_project_name: requireOutputString(outputs, 'ai_foundry_default_project_name'),
    ai_foundry_id: requireOutputString(outputs, 'ai_foundry_id'),
    apim_gateway_url: readOptionalOutputString(outputs, 'apim_gateway_url'),
    auth_tenant_id: readOptionalOutputString(outputs, 'auth_tenant_id'),
    api_token_scope: readOptionalOutputString(outputs, 'api_token_scope'),
    agent_token_scope: readOptionalOutputString(outputs, 'agent_token_scope'),
    api_inbound_allowed_audiences: readOptionalOutputStringArray(outputs, 'api_inbound_allowed_audiences'),
    agent_inbound_allowed_audiences: readOptionalOutputStringArray(outputs, 'agent_inbound_allowed_audiences'),
    api_inbound_allowed_caller_app_ids: readOptionalOutputStringArray(outputs, 'api_inbound_allowed_caller_app_ids'),
    agent_inbound_allowed_caller_app_ids: readOptionalOutputStringArray(outputs, 'agent_inbound_allowed_caller_app_ids')
  };
}

function readAgentEndpointEnvName(strategyDir: string): 'AZURE_OPENAI_ENDPOINT' | 'AZURE_AI_PROJECT_ENDPOINT' {
  const manifestPath = resolve(strategyDir, 'agent', 'component.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ComponentManifest;
  const envVars = [...(manifest.requiredEnv ?? []), ...(manifest.optionalEnv ?? [])];

  if (envVars.includes('AZURE_OPENAI_ENDPOINT')) {
    return 'AZURE_OPENAI_ENDPOINT';
  }
  if (envVars.includes('AZURE_AI_PROJECT_ENDPOINT')) {
    return 'AZURE_AI_PROJECT_ENDPOINT';
  }

  throw new Error(`Could not determine the agent endpoint env var from ${manifestPath}`);
}

function inferContainerAppNameFromFqdn(fqdn: string): string {
  const appName = fqdn.split('.')[0]?.trim();
  if (!appName) {
    throw new Error(`Could not infer a Container App name from FQDN: ${fqdn}`);
  }
  return appName;
}

function normalizeUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

async function readContainerAppEnvValue(
  resourceGroupName: string,
  containerAppName: string,
  envName: string
): Promise<string | undefined> {
  const value = (
    await runCapture(
      'az',
      [
        'containerapp',
        'show',
        '--resource-group',
        resourceGroupName,
        '--name',
        containerAppName,
        '--query',
        `properties.template.containers[0].env[?name=='${envName}'].value | [0]`,
        '-o',
        'tsv'
      ],
      REPO_ROOT,
      60_000
    )
  ).trim();

  return value && value !== 'null' ? value : undefined;
}

async function verifyAgentEndpointRouting(
  strategyDir: string,
  outputs: TerraformOutputMap,
  options: CliOptions
): Promise<void> {
  const endpointEnvName = readAgentEndpointEnvName(strategyDir);
  const referenceOutputs = toReferenceOutputs(outputs);
  const resourceGroupName = requireOutputString(outputs, 'resource_group_name');
  const agentFqdn = requireOutputString(outputs, 'agent_internal_fqdn');
  const agentAppName = inferContainerAppNameFromFqdn(agentFqdn);
  const deployedEndpoint = await readContainerAppEnvValue(resourceGroupName, agentAppName, endpointEnvName);

  if (!deployedEndpoint) {
    throw new Error(`Could not read ${endpointEnvName} from deployed Container App ${agentAppName}`);
  }

  const expectedEndpoint =
    endpointEnvName === 'AZURE_OPENAI_ENDPOINT'
      ? deriveOpenAIEndpoint(referenceOutputs)
      : deriveFoundryEndpoint(referenceOutputs);

  if (normalizeUrl(deployedEndpoint) !== normalizeUrl(expectedEndpoint)) {
    throw new Error(
      `Endpoint verification failed for ${agentAppName}: expected ${endpointEnvName}=${expectedEndpoint}, found ${deployedEndpoint}`
    );
  }

  const apimGatewayUrl = readOptionalOutputString(outputs, 'apim_gateway_url');
  const apimBaseUrl = readOptionalOutputString(outputs, 'apim_openai_api_base_url');
  const apimChatTemplate = readOptionalOutputString(outputs, 'apim_chat_completions_url_template');

  if (options.enableApimAiGateway) {
    if (!apimGatewayUrl || !apimBaseUrl || !apimChatTemplate) {
      throw new Error('APIM verification failed: expected APIM outputs are missing from Terraform outputs');
    }

    if (
      endpointEnvName === 'AZURE_OPENAI_ENDPOINT' &&
      normalizeUrl(deployedEndpoint) !== normalizeUrl(apimGatewayUrl)
    ) {
      throw new Error(
        `APIM verification failed: expected OpenAI-compatible agent to use ${apimGatewayUrl}, found ${deployedEndpoint}`
      );
    }

    if (endpointEnvName === 'AZURE_AI_PROJECT_ENDPOINT') {
      log('APIM enabled: Foundry Agent Service correctly kept the direct project endpoint.');
    } else {
      log(`APIM enabled: verified ${endpointEnvName} routes through ${apimGatewayUrl}.`);
    }
    return;
  }

  if (apimGatewayUrl || apimBaseUrl || apimChatTemplate) {
    throw new Error('Direct-mode verification failed: APIM outputs were present even though APIM was not requested');
  }

  log(`Direct mode: verified ${endpointEnvName} routes directly to ${expectedEndpoint}.`);
}

function requireEnvVar(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildDeployArgs(
  options: CliOptions,
  profile: DeployedTestProfile,
  workspace: string,
  projectName: string,
  sshPublicKeyFile: string | undefined,
  destroy = false
): string[] {
  const args = [DEPLOY_SCRIPT];
  if (destroy) {
    args.push('--destroy');
  }

  args.push(
    '--strategy',
    options.strategy ?? '',
    '--test-profile',
    profile,
    '--workspace',
    workspace,
    '--name',
    projectName
  );

  if (options.location) args.push('--location', options.location);
  if (options.allowedCidr) args.push('--allowed-cidr', options.allowedCidr);
  if (options.tag) args.push('--tag', options.tag);
  if (options.enableApimAiGateway) args.push('--enable-apim-ai-gateway');
  if (options.apimSkuName) args.push('--apim-sku-name', options.apimSkuName);
  if (sshPublicKeyFile && requiresJumpbox(profile)) {
    args.push('--ssh-public-key-file', sshPublicKeyFile);
  }

  return args;
}

async function destroyStrategy(
  options: CliOptions,
  profile: DeployedTestProfile,
  workspace: string,
  projectName: string,
  sshPublicKeyFile: string | undefined
): Promise<void> {
  log(`Destroying ${profile} deployment...`);
  await runStreaming(
    process.execPath,
    buildDeployArgs(options, profile, workspace, projectName, sshPublicKeyFile, true),
    REPO_ROOT
  );
}

async function waitForPrivateFrontendHealth(target: JumpboxTarget, frontendUrl: string): Promise<void> {
  const healthUrl = deriveDeepHealthUrl(frontendUrl);
  const command = buildPrivateFrontendHealthCommand(healthUrl);

  log(`Waiting for private frontend health endpoint via jumpbox: ${healthUrl}`);
  await runJumpboxBashScript(target, command);
}

async function runPrivateE2E(target: JumpboxTarget, profile: DeployedTestProfile, frontendUrl: string): Promise<void> {
  const remoteRootDir = `/tmp/caira-strategy-builder-${profile}`;
  const remoteE2EDir = `${remoteRootDir}/testing/e2e`;
  await copyDirectoryToJumpbox(target, REPO_ROOT, remoteRootDir);

  const command = buildPrivateE2ECommand(remoteE2EDir, frontendUrl);

  log(`Running private E2E tests against ${frontendUrl}`);
  await runJumpboxBashScript(target, command);
}

async function getSubscriptionId(): Promise<string> {
  const id = (await runCapture('az', ['account', 'show', '--query', 'id', '-o', 'tsv'], REPO_ROOT, 30_000)).trim();
  if (!id) {
    throw new Error('Could not determine the current Azure subscription ID');
  }
  return id;
}

async function verifyCapabilityHostWiring(outputs: TerraformOutputMap): Promise<void> {
  const subscriptionId = await getSubscriptionId();
  const resourceGroupName = requireOutputString(outputs, 'resource_group_name');
  const aiFoundryName = requireOutputString(outputs, 'ai_foundry_name');
  const projectName = requireOutputString(outputs, 'ai_foundry_default_project_name');

  const expectedCosmos = requireEnvVar('TF_VAR_private_foundry_capability_hosts_pool_cosmosdb_account_name');
  const expectedStorage = requireEnvVar('TF_VAR_private_foundry_capability_hosts_pool_storage_account_name');
  const expectedSearch = requireEnvVar('TF_VAR_private_foundry_capability_hosts_pool_search_service_name');

  const baseManagementUrl = `https://management.azure.com/subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.CognitiveServices/accounts/${aiFoundryName}/projects/${projectName}`;
  const connectionsRaw = await runCapture(
    'az',
    ['rest', '--method', 'get', '--url', `${baseManagementUrl}/connections?api-version=2025-06-01`],
    REPO_ROOT,
    60_000
  );
  const connections = JSON.parse(connectionsRaw) as ListConnectionsResponse;
  const connectionNames = new Set(
    (connections.value ?? []).map((entry) => entry.name).filter((entry): entry is string => typeof entry === 'string')
  );

  for (const expectedName of [expectedCosmos, expectedStorage, expectedSearch]) {
    if (!connectionNames.has(expectedName)) {
      throw new Error(`Capability-host validation failed: missing project connection "${expectedName}"`);
    }
  }

  const capabilityHostRaw = await runCapture(
    'az',
    [
      'rest',
      '--method',
      'get',
      '--url',
      `${baseManagementUrl}/capabilityHosts/agents-capability-host?api-version=2025-04-01-preview`
    ],
    REPO_ROOT,
    60_000
  );
  const capabilityHost = JSON.parse(capabilityHostRaw) as CapabilityHostResponse;

  if (capabilityHost.name !== 'agents-capability-host') {
    throw new Error('Capability-host validation failed: the agents-capability-host resource was not found');
  }

  const vectorStoreConnections = new Set(capabilityHost.properties?.vectorStoreConnections ?? []);
  const storageConnections = new Set(capabilityHost.properties?.storageConnections ?? []);
  const threadStorageConnections = new Set(capabilityHost.properties?.threadStorageConnections ?? []);

  if (!vectorStoreConnections.has(expectedSearch)) {
    throw new Error(`Capability-host validation failed: expected vector store connection "${expectedSearch}"`);
  }
  if (!storageConnections.has(expectedStorage)) {
    throw new Error(`Capability-host validation failed: expected storage connection "${expectedStorage}"`);
  }
  if (!threadStorageConnections.has(expectedCosmos)) {
    throw new Error(`Capability-host validation failed: expected thread storage connection "${expectedCosmos}"`);
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!options || !options.strategy) {
    process.exit(1);
  }

  const strategyDir = resolveStrategyPath(options.strategy);
  const strategyName = basename(strategyDir);
  const infraDir = resolve(strategyDir, 'infra');

  let sshKeyPair: TemporarySshKeyPair | undefined;
  const needsJumpbox = options.testProfiles.some((profile) => requiresJumpbox(profile));
  if (needsJumpbox) {
    log('Generating temporary SSH key for private-profile jumpbox access...');
    sshKeyPair = await createTemporarySshKeyPair();
  }

  try {
    for (const profile of options.testProfiles) {
      const projectName = options.projectName?.trim() || deriveProfileProjectName(strategyName, profile);
      const workspaceBaseName = options.projectName?.trim() || strategyName;
      const workspace = deriveProfileWorkspace(workspaceBaseName, profile);
      const sshPublicKeyFile = sshKeyPair ? `${sshKeyPair.privateKeyPath}.pub` : undefined;

      try {
        log(`Deploying ${strategyName} with profile ${profile}...`);
        await runStreaming(
          process.execPath,
          buildDeployArgs(options, profile, workspace, projectName, sshPublicKeyFile),
          REPO_ROOT
        );

        const outputs = await readTerraformOutputs(infraDir);
        await verifyAgentEndpointRouting(strategyDir, outputs, options);
        const frontendUrl = requireOutputString(outputs, 'frontend_url');

        if (usesPrivateNetworking(profile)) {
          const jumpboxTarget: JumpboxTarget = {
            host: requireOutputString(outputs, 'testing_jumpbox_public_ip'),
            username: requireOutputString(outputs, 'testing_jumpbox_admin_username'),
            privateKeyPath: sshKeyPair?.privateKeyPath ?? ''
          };

          if (!jumpboxTarget.privateKeyPath) {
            throw new Error(`Profile ${profile} requires a jumpbox SSH key`);
          }

          log(`Waiting for jumpbox SSH: ${jumpboxTarget.username}@${jumpboxTarget.host}`);
          await waitForJumpboxSsh(jumpboxTarget);
          await waitForPrivateFrontendHealth(jumpboxTarget, frontendUrl);
          await runPrivateE2E(jumpboxTarget, profile, frontendUrl);
        } else {
          const healthUrl = deriveDeepHealthUrl(frontendUrl);
          log(`Waiting for deployed frontend deep health endpoint: ${healthUrl}`);
          const healthy = await waitForHealthy(healthUrl, 600_000);
          if (!healthy) {
            throw new Error(`Deployed frontend did not become healthy at ${healthUrl}`);
          }

          await ensureE2EDependencies();
          log(`Running deployed E2E tests against ${frontendUrl}`);
          await runStreaming('npx', ['vitest', 'run', '--reporter', 'verbose'], E2E_DIR, {
            E2E_BASE_URL: frontendUrl
          });
        }

        if (usesCapabilityHost(profile)) {
          log('Verifying capability-host connections through the Azure control plane...');
          await verifyCapabilityHostWiring(outputs);
        }

        log(`Profile ${profile} validation passed.`);
      } finally {
        if (!options.keepDeployed) {
          try {
            await destroyStrategy(options, profile, workspace, projectName, sshPublicKeyFile);
          } catch (error) {
            logError(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
          }
        } else {
          log(`Keeping ${profile} deployment for ${options.strategy}`);
        }
      }
    }
  } finally {
    if (sshKeyPair && !options.keepDeployed) {
      await sshKeyPair.cleanup();
    } else if (sshKeyPair) {
      log(`Private jumpbox key retained at ${sshKeyPair.privateKeyPath}`);
    }
  }
}

main().catch((error: unknown) => {
  logError(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
