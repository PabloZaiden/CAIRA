/**
 * Dev Compose — interactive developer convenience script.
 *
 * Starts a generated deployment strategy in foreground mode so a developer can open
 * the frontend in their browser and interact with it manually. No
 * automated tests are run.
 *
 * Usage:
 *   # With mocks (default):
 *   node scripts/dev-compose.ts --strategy deployment-strategies/typescript-openai-agent-sdk
 *
 *   # Against real Azure (requires .env with endpoints):
 *   node scripts/dev-compose.ts --strategy deployment-strategies/typescript-foundry-agent-service --no-mock
 *
 * What it does:
 *   1. Optionally generates a mock overlay (skipped with --no-mock)
 *   2. Runs `docker compose up --build` in foreground (logs stream to terminal)
 *   3. On Ctrl+C (SIGINT/SIGTERM), tears down the compose stack and cleans up
 *
 * The script does NOT run any automated tests — it is purely for manual
 * interactive testing in the browser.
 */

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  log,
  logError,
  runCommand,
  generateTestOverlay,
  cleanupOverlay,
  getComposeFiles,
  detectAgentVariant,
  MOCK_MAP,
  ensureAzurecliVolume,
  fixAzurecliPermissions
} from './lib/compose-helpers.ts';
import { resolveStrategyPath } from './lib/paths.ts';

// ─── State ──────────────────────────────────────────────────────────────

let composeProcess: ChildProcess | null = null;
let overlayPath: string | null = null;
let composeFiles: string[] = [];
let projectName = '';
let sampleDir = '';
let shuttingDown = false;

// ─── Cleanup ────────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  process.stdout.write('\n');
  log(`Received ${signal}. Shutting down...`);

  // Kill the foreground compose process if still running
  if (composeProcess && !composeProcess.killed) {
    composeProcess.kill('SIGTERM');
  }

  // Tear down compose stack
  if (composeFiles.length > 0) {
    log('Tearing down compose stack...');
    await runCommand(
      'docker',
      ['compose', ...composeFiles, '-p', projectName, 'down', '--volumes', '--remove-orphans'],
      { cwd: sampleDir, timeoutMs: 60_000 }
    );
    log('Stack torn down.');
  }

  // Clean up overlay file
  await cleanupOverlay(overlayPath);
  if (overlayPath) {
    log('Overlay file cleaned up.');
  }

  process.exit(0);
}

// ─── CLI ────────────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(`
Dev Compose — start a deployment strategy for interactive testing

Usage:
  node scripts/dev-compose.ts [options]

Options:
  --strategy <path> Path to the deployment strategy directory (required)
  --no-mock         Run against real Azure (no mock overlay, requires .env)
  --help            Show this help message

Examples:
  # With mocks (default):
  node scripts/dev-compose.ts \\
    --strategy deployment-strategies/typescript-openai-agent-sdk

  # Against real Azure:
  node scripts/dev-compose.ts \\
    --strategy deployment-strategies/typescript-foundry-agent-service --no-mock

This starts the full stack in the foreground.
Open the frontend in your browser to interact with it manually.
Press Ctrl+C to stop and tear down the stack.
`);
}

interface DevComposeOptions {
  strategyDir: string;
  noMock: boolean;
}

function parseArgs(args: string[]): DevComposeOptions | null {
  let strategy: string | undefined;
  let noMock = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    switch (arg) {
      case '--strategy':
        strategy = args[++i];
        break;
      case '--no-mock':
        noMock = true;
        break;
      case '--help':
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
    return null;
  }

  return { strategyDir: resolveStrategyPath(strategy), noMock };
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  if (!options) {
    process.exit(1);
  }

  sampleDir = options.strategyDir;
  const sampleName = basename(sampleDir);
  const useMock = !options.noMock;

  // Validate sample directory
  const composeFile = resolve(sampleDir, 'docker-compose.yml');
  if (!existsSync(composeFile)) {
    logError(`docker-compose.yml not found in ${sampleDir}`);
    process.exit(1);
  }

  // In no-mock mode, verify .env exists
  if (!useMock) {
    const envFile = resolve(sampleDir, '.env');
    if (!existsSync(envFile)) {
      logError(`.env file not found in ${sampleDir}. ` + 'Run `npm run dev:azure` instead, or create .env manually.');
      process.exit(1);
    }
  }

  // Detect agent variant for display
  const variant = detectAgentVariant(sampleName);
  const mockInfo = variant ? MOCK_MAP[variant] : undefined;

  log(`Starting dev stack for: ${sampleName}`);
  if (useMock && mockInfo) {
    log(`Mock: ${mockInfo.mockDir} on port ${mockInfo.port}`);
  } else if (!useMock) {
    log('Mode: Azure (no mock)');
  }

  // Generate mock overlay (only in mock mode)
  const repoRoot = resolve(import.meta.dirname ?? '.', '..');
  if (useMock) {
    overlayPath = await generateTestOverlay(sampleDir, repoRoot);
  }
  composeFiles = getComposeFiles(sampleDir, overlayPath);
  projectName = `caira-dev-${sampleName}`;

  // Register signal handlers for clean shutdown
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // Print access information
  process.stdout.write('\n');
  process.stdout.write('─'.repeat(60) + '\n');
  process.stdout.write(`  CAIRA Dev Stack${useMock ? ' (Mock)' : ' (Azure)'}\n`);
  process.stdout.write('─'.repeat(60) + '\n');
  process.stdout.write(`  Sample:   ${sampleName}\n`);
  if (useMock && mockInfo) {
    process.stdout.write(`  Mock:     ${mockInfo.mockDir} (:${mockInfo.port})\n`);
  }
  process.stdout.write(`  Frontend: http://localhost:8080\n`);
  process.stdout.write(`  API:      http://localhost:4000\n`);
  process.stdout.write(`  Agent:    http://localhost:3000\n`);
  process.stdout.write('─'.repeat(60) + '\n');
  process.stdout.write('  Press Ctrl+C to stop and tear down\n');
  process.stdout.write('─'.repeat(60) + '\n');
  process.stdout.write('\n');

  // Ensure the azurecli volume exists and has correct permissions.
  // The base compose declares `azurecli: external: true` — this creates
  // it if missing. Then we fix ownership so the azcred sidecar (uid 65532)
  // can read the Azure CLI credentials for /identity to work.
  await ensureAzurecliVolume();
  await fixAzurecliPermissions();

  log('Running docker compose up --build (this may take a few minutes on first run)...');

  // Run docker compose up in foreground with stdio inherited
  // so the user sees all build output and container logs directly.
  const composeArgs = ['compose', ...composeFiles, '-p', projectName, 'up', '--build', '--abort-on-container-exit'];

  composeProcess = spawn('docker', composeArgs, {
    cwd: sampleDir,
    stdio: 'inherit'
  });

  // Wait for the compose process to exit
  const proc = composeProcess;
  const exitCode = await new Promise<number>((resolve) => {
    proc.on('close', (code) => {
      resolve(code ?? 1);
    });
  });

  // If we get here, compose exited on its own (container crash, etc.)
  if (!shuttingDown) {
    log(`Docker compose exited with code ${exitCode}`);
    log('Cleaning up...');

    // Tear down any remaining containers
    await runCommand(
      'docker',
      ['compose', ...composeFiles, '-p', projectName, 'down', '--volumes', '--remove-orphans'],
      { cwd: sampleDir, timeoutMs: 60_000 }
    );

    await cleanupOverlay(overlayPath);
    process.exit(exitCode);
  }
}

// Only run CLI when this file is the entry point
const isMain = import.meta.url === `file://${process.argv[1]}` || import.meta.filename === process.argv[1];

if (isMain) {
  main().catch((err: unknown) => {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
