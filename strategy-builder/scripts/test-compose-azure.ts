/**
 * Test Compose Azure — run E2E tests against a deployment strategy using real Azure AI Foundry.
 *
 * This is a thin orchestrator that:
 *   1. Ensures CAIRA is deployed (skips if already deployed)
 *   2. Writes the .env file for the target deployment strategy
 *   3. Injects Azure CLI credentials into the Docker volume
 *   4. Runs compose-test-runner in no-mock mode
 *
 * Usage:
 *   node scripts/test-compose-azure.ts --strategy deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca
 */

import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureDeploy } from './deploy-reference-architecture.ts';
import { log, logError, fixAzurecliPermissions, ensureAzurecliVolume } from './lib/compose-helpers.ts';

const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(import.meta.dirname ?? '.', '..');

// ─── CLI ────────────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(`
Test Compose Azure — run E2E tests against real Azure AI Foundry

Usage:
  node scripts/test-compose-azure.ts --strategy <path>

Options:
  --strategy <path> Path to the deployment strategy directory (required)
  --force-deploy    Force Terraform re-apply even if state exists
  --keep-alive      Keep the compose stack running after tests
  --help            Show this help message

Examples:
  node scripts/test-compose-azure.ts \\
    --strategy deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca

  npm run test:compose:azure -- deployment-strategies/foundry_agentic_app/typescript-foundry-agent-service-aca
`);
}

// ─── Azure credential injection ─────────────────────────────────────────

async function injectAzureCredentials(): Promise<void> {
  log('Injecting Azure CLI credentials into Docker volume...');
  try {
    await execFileAsync('node', [resolve(REPO_ROOT, 'scripts', 'azure-login.ts'), '--inject'], {
      timeout: 30_000,
      maxBuffer: 1024 * 1024
    });
    log('Azure credentials injected.');
  } catch {
    // --inject may fail if the validation inside the container fails
    // (known issue — creds are valid but the validation mounts at wrong path).
    // Ensure the volume exists and fix permissions as a fallback.
    log('Credential injection reported an error — ensuring volume and permissions...');
    await ensureAzurecliVolume();
    await fixAzurecliPermissions();
  }
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let strategy: string | undefined;
  let forceDeploy = false;
  let keepAlive = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    switch (arg) {
      case '--strategy':
        strategy = args[++i];
        break;
      case '--force-deploy':
        forceDeploy = true;
        break;
      case '--keep-alive':
        keepAlive = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        logError(`Unknown option: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  if (!strategy) {
    logError('--strategy <path> is required');
    printUsage();
    process.exit(1);
  }

  // Step 1: Ensure CAIRA is deployed and .env is written
  log('Step 1/3: Ensuring CAIRA deployment...');
  await ensureDeploy({ strategy, force: forceDeploy });

  // Step 2: Inject Azure credentials into Docker volume
  log('Step 2/3: Setting up Azure credentials...');
  await injectAzureCredentials();

  // Step 3: Run compose-test-runner in no-mock mode
  log('Step 3/3: Running E2E tests against Azure...');
  const runnerArgs = [resolve(REPO_ROOT, 'scripts', 'compose-test-runner.ts'), '--strategy', strategy, '--no-mock'];
  if (keepAlive) {
    runnerArgs.push('--keep-alive');
  }

  try {
    const result = await execFileAsync('node', runnerArgs, {
      timeout: 600_000, // 10 minutes
      maxBuffer: 10 * 1024 * 1024
    });
    process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; code?: number };
    if (error.stdout) process.stdout.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    process.exit(error.code ?? 1);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}` || import.meta.filename === process.argv[1];

if (isMain) {
  main().catch((err: unknown) => {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
