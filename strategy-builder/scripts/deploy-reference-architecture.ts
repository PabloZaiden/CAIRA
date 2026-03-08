/**
 * CAIRA Deploy — Terraform deployment + output extraction + .env generation.
 *
 * Ensures the CAIRA macro reference architecture infrastructure is deployed,
 * extracts Terraform outputs, and writes .env files for deployment strategy directories
 * with the correct Azure endpoints and model names.
 *
 * Usage:
 *   node scripts/deploy-reference-architecture.ts                                    # ensure deployed + write .env for all strategies
 *   node scripts/deploy-reference-architecture.ts --strategy deployment-strategies/... # write .env for one strategy
 *   node scripts/deploy-reference-architecture.ts --output-only          # skip deploy, just write .env
 *   node scripts/deploy-reference-architecture.ts --force                # force re-apply even if state exists
 *   node scripts/deploy-reference-architecture.ts --destroy              # tear down the deployment
 *
 * Idempotent: if Terraform state already has valid outputs, the deploy
 * step is skipped entirely. Only the .env files are (re)written.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import {
  DEPLOYMENT_STRATEGIES_ROOT,
  REFERENCE_ARCHITECTURES_ROOT,
  listGeneratedStrategyDirs,
  resolveStrategyPath
} from './lib/paths.ts';

const execFileAsync = promisify(execFile);

// ─── Constants ──────────────────────────────────────────────────────────

const TF_DIR = resolve(REFERENCE_ARCHITECTURES_ROOT, 'foundry_agentic_app');
const STRATEGIES_DIR = DEPLOYMENT_STRATEGIES_ROOT;

/**
 * Model defaults per variant. These match the code defaults in each
 * agent component's config.ts.
 */
const VARIANT_CONFIG: Record<string, { endpointEnvVar: string; modelEnvVar: string; defaultModel: string }> = {
  'foundry-agent-service': {
    endpointEnvVar: 'AZURE_AI_PROJECT_ENDPOINT',
    modelEnvVar: 'AGENT_MODEL',
    defaultModel: 'gpt-5.2-chat'
  },
  'openai-agent-sdk': {
    endpointEnvVar: 'AZURE_OPENAI_ENDPOINT',
    modelEnvVar: 'AGENT_MODEL',
    defaultModel: 'gpt-5.2-chat'
  },
  'microsoft-agent-framework': {
    endpointEnvVar: 'AZURE_OPENAI_ENDPOINT',
    modelEnvVar: 'AGENT_MODEL',
    defaultModel: 'gpt-5.2-chat'
  }
};

// ─── Logging ────────────────────────────────────────────────────────────

function log(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${timestamp}] ${message}\n`);
}

function logError(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stderr.write(`[${timestamp}] ERROR: ${message}\n`);
}

// ─── Terraform helpers ──────────────────────────────────────────────────

export interface TerraformOutputs {
  ai_foundry_name: string;
  ai_foundry_default_project_name: string;
  ai_foundry_id: string;
}

/**
 * Run a command with timeout, returning stdout. Throws on failure.
 */
async function run(cmd: string, args: string[], options?: { cwd?: string; timeoutMs?: number }): Promise<string> {
  const result = await execFileAsync(cmd, args, {
    cwd: options?.cwd,
    timeout: options?.timeoutMs ?? 120_000,
    maxBuffer: 10 * 1024 * 1024
  });
  return result.stdout;
}

/**
 * Run a command, returning { stdout, stderr, exitCode }. Never throws.
 */
async function runSafe(
  cmd: string,
  args: string[],
  options?: { cwd?: string; timeoutMs?: number }
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  try {
    const result = await execFileAsync(cmd, args, {
      cwd: options?.cwd,
      timeout: options?.timeoutMs ?? 120_000,
      maxBuffer: 10 * 1024 * 1024
    });
    return { stdout: result.stdout, stderr: result.stderr, exitCode: 0 };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; code?: number; message?: string };
    return {
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? String(err),
      exitCode: error.code ?? 1
    };
  }
}

/**
 * Check if Terraform is initialized in the working directory.
 */
function isTerraformInitialized(): boolean {
  return existsSync(resolve(TF_DIR, '.terraform'));
}

/**
 * Initialize Terraform (if not already initialized).
 */
async function terraformInit(): Promise<void> {
  if (isTerraformInitialized()) {
    log('Terraform already initialized.');
    return;
  }
  log('Running terraform init...');
  await run('terraform', ['init', '-input=false'], {
    cwd: TF_DIR,
    timeoutMs: 120_000
  });
  log('Terraform initialized.');
}

/**
 * Try to extract outputs from existing Terraform state.
 * Returns null if no state exists or outputs are empty.
 */
async function getExistingOutputs(): Promise<TerraformOutputs | null> {
  if (!isTerraformInitialized()) return null;

  const result = await runSafe('terraform', ['output', '-json'], {
    cwd: TF_DIR,
    timeoutMs: 30_000
  });

  if (result.exitCode !== 0) return null;

  try {
    const outputs = JSON.parse(result.stdout);
    // Check if outputs are populated (not just an empty object)
    if (
      !outputs.ai_foundry_name?.value ||
      !outputs.ai_foundry_default_project_name?.value ||
      !outputs.ai_foundry_id?.value
    ) {
      return null;
    }
    return {
      ai_foundry_name: outputs.ai_foundry_name.value,
      ai_foundry_default_project_name: outputs.ai_foundry_default_project_name.value,
      ai_foundry_id: outputs.ai_foundry_id.value
    };
  } catch {
    return null;
  }
}

/**
 * Run terraform apply and return outputs.
 */
async function terraformApply(): Promise<TerraformOutputs> {
  log('Running terraform apply (this may take several minutes)...');
  await run('terraform', ['apply', '-auto-approve', '-input=false'], {
    cwd: TF_DIR,
    timeoutMs: 600_000 // 10 minutes
  });
  log('Terraform apply completed.');

  const outputs = await getExistingOutputs();
  if (!outputs) {
    throw new Error('Terraform apply succeeded but outputs are missing');
  }
  return outputs;
}

/**
 * Run terraform destroy.
 */
async function terraformDestroy(): Promise<void> {
  await terraformInit();
  log('Running terraform destroy (this may take several minutes)...');
  await run('terraform', ['destroy', '-auto-approve', '-input=false'], {
    cwd: TF_DIR,
    timeoutMs: 600_000
  });
  log('Terraform destroy completed. Azure resources have been removed.');
}

// ─── Endpoint derivation ────────────────────────────────────────────────

/**
 * Derive the Azure AI Foundry project endpoint from Terraform outputs.
 * This is the endpoint the Foundry Agent Service SDK expects.
 */
export function deriveFoundryEndpoint(outputs: TerraformOutputs): string {
  return `https://${outputs.ai_foundry_name}.services.ai.azure.com/api/projects/${outputs.ai_foundry_default_project_name}`;
}

/**
 * Derive the Azure OpenAI-compatible endpoint from Terraform outputs.
 * This is the endpoint the OpenAI Agent SDK expects.
 */
export function deriveOpenAIEndpoint(outputs: TerraformOutputs): string {
  return `https://${outputs.ai_foundry_name}.openai.azure.com/`;
}

// ─── .env generation ────────────────────────────────────────────────────

/**
 * Detect the agent variant from strategy provenance, with a directory-name fallback.
 */
function detectVariant(strategyDir: string): string | null {
  const provenancePath = resolve(strategyDir, 'strategy.provenance.json');
  if (existsSync(provenancePath)) {
    try {
      const provenance = JSON.parse(readFileSync(provenancePath, 'utf-8')) as {
        flavor?: { agentVariant?: string };
      };
      if (typeof provenance.flavor?.agentVariant === 'string') {
        return provenance.flavor.agentVariant;
      }
    } catch {
      // Fall back to directory-name detection below.
    }
  }

  const strategyName = basename(strategyDir);
  for (const variant of Object.keys(VARIANT_CONFIG)) {
    if (strategyName.includes(variant)) return variant;
  }
  return null;
}

/**
 * Generate and write .env file for a deployment strategy directory.
 */
async function writeEnvFile(strategyDir: string, outputs: TerraformOutputs): Promise<boolean> {
  const strategyName = basename(strategyDir);
  const variant = detectVariant(strategyDir);

  if (!variant) {
    log(`Skipping ${strategyName} — unknown agent variant`);
    return false;
  }

  const config = VARIANT_CONFIG[variant];
  if (!config) {
    log(`Skipping ${strategyName} — no config for variant ${variant}`);
    return false;
  }
  const endpoint = variant === 'foundry-agent-service' ? deriveFoundryEndpoint(outputs) : deriveOpenAIEndpoint(outputs);

  const envContent = `# Auto-generated by deploy-reference-architecture.ts — do not commit
${config.endpointEnvVar}=${endpoint}
${config.modelEnvVar}=${config.defaultModel}
`;

  const envPath = resolve(strategyDir, '.env');
  await writeFile(envPath, envContent);
  log(`Wrote ${envPath}`);
  log(`  ${config.endpointEnvVar}=${endpoint}`);
  log(`  ${config.modelEnvVar}=${config.defaultModel}`);
  return true;
}

/**
 * Write .env files for all deployment strategy directories, or a specific one.
 */
export async function writeEnvFiles(outputs: TerraformOutputs, specificStrategy?: string): Promise<void> {
  if (specificStrategy) {
    const strategyDir = resolveStrategyPath(specificStrategy);
    if (!existsSync(strategyDir)) {
      throw new Error(`Deployment strategy directory not found: ${strategyDir}`);
    }
    await writeEnvFile(strategyDir, outputs);
    return;
  }

  // Write .env for all deployment strategies
  if (!existsSync(STRATEGIES_DIR)) {
    log('No deployment-strategies/ directory found. Run `npm run generate` first.');
    return;
  }

  let count = 0;
  for (const strategyDir of listGeneratedStrategyDirs(STRATEGIES_DIR)) {
    const wrote = await writeEnvFile(strategyDir, outputs);
    if (wrote) count++;
  }
  log(`Wrote .env files for ${count} deployment strategy(ies).`);
}

// ─── Azure login check ─────────────────────────────────────────────────

async function ensureAzureLogin(): Promise<void> {
  const result = await runSafe('az', ['account', 'show', '-o', 'json'], { timeoutMs: 15_000 });
  if (result.exitCode !== 0) {
    throw new Error('Not logged in to Azure CLI. Run `az login` first, then retry.');
  }
  try {
    const account = JSON.parse(result.stdout);
    log(`Azure CLI: logged in as ${account.user?.name ?? 'unknown'} (subscription: ${account.id ?? 'unknown'})`);
  } catch {
    log('Azure CLI: logged in (could not parse account details)');
  }
}

// ─── RBAC role assignment ──────────────────────────────────────────────

/**
 * Roles required for the deploying principal to interact with the AI Foundry
 * account (call models, use agents, etc.) during local testing.
 *
 * - Cognitive Services OpenAI User: Chat Completions / Responses API
 * - Azure AI User: wildcard Microsoft.CognitiveServices/* (agents, etc.)
 */
const REQUIRED_ROLES = ['Cognitive Services OpenAI User', 'Azure AI User'] as const;

/**
 * Identity info for the currently signed-in Azure principal.
 */
interface AzurePrincipal {
  objectId: string;
  principalType: 'User' | 'ServicePrincipal';
  displayName: string;
}

/**
 * Get the object ID and principal type of the currently signed-in Azure
 * principal. Works for both interactive user logins and service principals.
 */
async function getSignedInPrincipal(): Promise<AzurePrincipal> {
  // First check what kind of principal is signed in
  const accountResult = await runSafe('az', ['account', 'show', '-o', 'json'], {
    timeoutMs: 15_000
  });
  if (accountResult.exitCode !== 0) {
    throw new Error(`Failed to get Azure account info: ${accountResult.stderr}`);
  }

  const account = JSON.parse(accountResult.stdout);
  const userType: string = account.user?.type ?? 'user';
  const userName: string = account.user?.name ?? 'unknown';

  if (userType === 'servicePrincipal') {
    // For service principals, user.name is the appId/clientId
    const spResult = await runSafe('az', ['ad', 'sp', 'show', '--id', userName, '--query', 'id', '-o', 'tsv'], {
      timeoutMs: 15_000
    });
    if (spResult.exitCode !== 0) {
      throw new Error(`Failed to get service principal object ID: ${spResult.stderr}`);
    }
    return {
      objectId: spResult.stdout.trim(),
      principalType: 'ServicePrincipal',
      displayName: userName
    };
  }

  // For users, use az ad signed-in-user show
  const userResult = await runSafe('az', ['ad', 'signed-in-user', 'show', '--query', 'id', '-o', 'tsv'], {
    timeoutMs: 15_000
  });
  if (userResult.exitCode !== 0) {
    throw new Error(`Failed to get signed-in user object ID: ${userResult.stderr}`);
  }
  return {
    objectId: userResult.stdout.trim(),
    principalType: 'User',
    displayName: userName
  };
}

/**
 * List existing role assignments for a given principal on a scope.
 * Returns the set of role definition names already assigned.
 */
async function getExistingRoleAssignments(scope: string, principalId: string): Promise<Set<string>> {
  const result = await runSafe(
    'az',
    [
      'role',
      'assignment',
      'list',
      '--scope',
      scope,
      '--assignee',
      principalId,
      '--query',
      '[].roleDefinitionName',
      '-o',
      'json'
    ],
    { timeoutMs: 30_000 }
  );
  if (result.exitCode !== 0) {
    log(`Warning: could not list role assignments: ${result.stderr}`);
    return new Set();
  }
  try {
    const roles: string[] = JSON.parse(result.stdout);
    return new Set(roles);
  } catch {
    return new Set();
  }
}

/**
 * Ensure the deploying principal has the required RBAC roles on the AI Foundry
 * account. Only assigns roles that are missing.
 */
export async function ensureRbac(aiFoundryId: string): Promise<void> {
  log('Checking RBAC role assignments for deploying principal...');

  const principal = await getSignedInPrincipal();
  log(`Signed-in principal: ${principal.displayName} (${principal.principalType}, ${principal.objectId})`);

  const existingRoles = await getExistingRoleAssignments(aiFoundryId, principal.objectId);

  const missingRoles = REQUIRED_ROLES.filter((role) => !existingRoles.has(role));

  if (missingRoles.length === 0) {
    log('All required RBAC roles already assigned.');
    return;
  }

  log(`Missing roles: ${missingRoles.join(', ')}`);

  for (const role of missingRoles) {
    log(`Assigning role: ${role}...`);
    const result = await runSafe(
      'az',
      [
        'role',
        'assignment',
        'create',
        '--scope',
        aiFoundryId,
        '--role',
        role,
        '--assignee-object-id',
        principal.objectId,
        '--assignee-principal-type',
        principal.principalType,
        '-o',
        'json'
      ],
      { timeoutMs: 60_000 }
    );
    if (result.exitCode !== 0) {
      logError(`Failed to assign role "${role}": ${result.stderr}`);
      throw new Error(`RBAC assignment failed for role "${role}"`);
    }
    log(`Assigned: ${role}`);
  }

  log('RBAC role assignments complete. Note: roles may take a few minutes to propagate.');
}

// ─── CLI ────────────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(`
CAIRA Deploy — Terraform deployment + .env generation for deployment strategies

Usage:
  node scripts/deploy-reference-architecture.ts [options]

Options:
  --strategy <path>  Write .env for a specific strategy only (default: all deployment strategies)
  --force            Force terraform apply even if state already exists
  --output-only      Skip deploy, just extract outputs and write .env files
  --destroy          Tear down the Azure deployment
  --help             Show this help message

Examples:
  # Deploy (if needed) and generate .env for all deployment strategies
  node scripts/deploy-reference-architecture.ts

  # Deploy and generate .env for one strategy
  node scripts/deploy-reference-architecture.ts --strategy deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca

  # Just regenerate .env files from existing deployment
  node scripts/deploy-reference-architecture.ts --output-only

  # Tear down Azure resources
  node scripts/deploy-reference-architecture.ts --destroy
`);
}

interface CairaDeployOptions {
  strategy: string | undefined;
  force: boolean;
  outputOnly: boolean;
  destroy: boolean;
}

function parseArgs(args: string[]): CairaDeployOptions | null {
  const options: CairaDeployOptions = {
    strategy: undefined,
    force: false,
    outputOnly: false,
    destroy: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    switch (arg) {
      case '--strategy':
        options.strategy = args[++i];
        break;
      case '--force':
        options.force = true;
        break;
      case '--output-only':
        options.outputOnly = true;
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

// ─── Main ───────────────────────────────────────────────────────────────

export interface DeployResult {
  outputs: TerraformOutputs;
  foundryEndpoint: string;
  openaiEndpoint: string;
  deployed: boolean; // true if terraform apply was run, false if reused existing
}

/**
 * Ensure CAIRA is deployed and return the outputs.
 *
 * This is the primary programmatic API, used by dev-azure.ts and
 * test-compose-azure.ts.
 */
export async function ensureDeploy(options?: {
  strategy?: string | undefined;
  force?: boolean | undefined;
  outputOnly?: boolean | undefined;
}): Promise<DeployResult> {
  await ensureAzureLogin();

  await terraformInit();

  let outputs: TerraformOutputs | null = null;
  let deployed = false;

  if (!options?.force) {
    outputs = await getExistingOutputs();
    if (outputs) {
      log(`Existing deployment found: ${outputs.ai_foundry_name}`);
    }
  }

  if (!outputs && !options?.outputOnly) {
    outputs = await terraformApply();
    deployed = true;
  }

  if (!outputs) {
    throw new Error(
      'No Terraform outputs available. Run without --output-only to deploy, or check your Terraform state.'
    );
  }

  const foundryEndpoint = deriveFoundryEndpoint(outputs);
  const openaiEndpoint = deriveOpenAIEndpoint(outputs);

  log(`Foundry endpoint: ${foundryEndpoint}`);
  log(`OpenAI endpoint:  ${openaiEndpoint}`);

  await writeEnvFiles(outputs, options?.strategy);

  // Ensure the deploying user has the required RBAC roles
  await ensureRbac(outputs.ai_foundry_id);

  return { outputs, foundryEndpoint, openaiEndpoint, deployed };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  if (!options) {
    process.exit(1);
  }

  // Handle --destroy separately
  if (options.destroy) {
    await ensureAzureLogin();
    await terraformDestroy();
    return;
  }

  const result = await ensureDeploy({
    strategy: options.strategy,
    force: options.force,
    outputOnly: options.outputOnly
  });

  process.stdout.write('\n');
  process.stdout.write('═'.repeat(60) + '\n');
  process.stdout.write(result.deployed ? '  CAIRA Deployed\n' : '  CAIRA Already Deployed\n');
  process.stdout.write('═'.repeat(60) + '\n');
  process.stdout.write(`  AI Foundry: ${result.outputs.ai_foundry_name}\n`);
  process.stdout.write(`  Foundry endpoint: ${result.foundryEndpoint}\n`);
  process.stdout.write(`  OpenAI endpoint:  ${result.openaiEndpoint}\n`);
  process.stdout.write('═'.repeat(60) + '\n');
}

// Only run CLI when this file is the entry point
const isMain = import.meta.url === `file://${process.argv[1]}` || import.meta.filename === process.argv[1];

if (isMain) {
  main().catch((err: unknown) => {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
