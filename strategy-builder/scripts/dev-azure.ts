/**
 * Dev Azure — start a deployment strategy locally against real Azure AI Foundry.
 *
 * This is a thin orchestrator that:
 *   1. Ensures CAIRA is deployed (skips if already deployed)
 *   2. Writes the .env file for the target deployment strategy
 *   4. Injects Azure CLI credentials into the Docker volume
 *   4. Starts the strategy with dev-compose in no-mock mode
 *
 * Usage:
 *   node scripts/dev-azure.ts --strategy deployment-strategies/typescript-foundry-agent-service
 */

import { resolve } from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureDeploy } from './deploy-reference-architecture.ts';
import { log, logError, fixAzurecliPermissions, ensureAzurecliVolume } from './lib/compose-helpers.ts';

const execFileAsync = promisify(execFile);

const REPO_ROOT = resolve(import.meta.dirname ?? '.', '..');

// ─── CLI ────────────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(`
Dev Azure — start a deployment strategy against real Azure AI Foundry

Usage:
  node scripts/dev-azure.ts --strategy <path>

Options:
  --strategy <path> Path to the deployment strategy directory (required)
  --force-deploy    Force Terraform re-apply even if state exists
  --help            Show this help message

Examples:
  node scripts/dev-azure.ts \\
    --strategy deployment-strategies/typescript-foundry-agent-service

  npm run dev:azure -- deployment-strategies/typescript-foundry-agent-service
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

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    switch (arg) {
      case '--strategy':
        strategy = args[++i];
        break;
      case '--force-deploy':
        forceDeploy = true;
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

  // Step 3: Launch dev-compose in no-mock mode
  log('Step 3/3: Starting dev stack against Azure...');
  const devCompose = spawn(
    'node',
    [resolve(REPO_ROOT, 'scripts', 'dev-compose.ts'), '--strategy', strategy, '--no-mock'],
    { stdio: 'inherit' }
  );

  // Forward exit code
  const exitCode = await new Promise<number>((resolve) => {
    devCompose.on('close', (code) => resolve(code ?? 1));
  });

  process.exit(exitCode);
}

const isMain = import.meta.url === `file://${process.argv[1]}` || import.meta.filename === process.argv[1];

if (isMain) {
  main().catch((err: unknown) => {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
