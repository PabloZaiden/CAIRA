/**
 * Compose Test Runner — orchestrates docker-compose-based E2E testing.
 *
 * Usage:
 *   node scripts/compose-test-runner.ts --strategy <path>
 *
 * What it does:
 *   0. Regenerates deployment strategies from components (unless --skip-regenerate)
 *   1. Starts docker compose (with optional test overlay)
 *   2. Waits for all services to become healthy
 *   3. Runs the E2E test suite against the compose stack
 *   4. Captures test output and container logs on failure
 *   5. Tears down the stack
 *   6. Exits with pass/fail code and summary
 */

import { existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import {
  log,
  logError,
  runCommand,
  waitForAnyHealthy,
  discoverContainerIp,
  generateTestOverlay,
  cleanupOverlay,
  getComposeFiles,
  captureContainerLogs,
  ensureAzurecliVolume,
  fixAzurecliPermissions
} from './lib/compose-helpers.ts';
import { generate } from './lib/generator/index.ts';
import { ensureDeploy } from './deploy-reference-architecture.ts';
import { DEPLOYMENT_STRATEGIES_ROOT, resolveStrategyPath } from './lib/paths.ts';

// ─── Types ──────────────────────────────────────────────────────────────

interface ComposeTestOptions {
  /** Path to the deployment strategy directory containing docker-compose.yml */
  strategyDir: string;
  /** Base URL for the frontend BFF (default: auto-discovered via container IP on port 8080) */
  baseUrl?: string | undefined;
  /** Timeout for health checks in ms (default: 60000) */
  healthTimeoutMs?: number | undefined;
  /** Whether to keep the stack running after tests (default: false) */
  keepAlive?: boolean | undefined;
  /** Whether tests run in mock mode (deterministic assertions). Default: true when mock overlay is present. */
  mockMode?: boolean | undefined;
  /** Skip regenerating deployment strategies from components before testing (default: false — always regenerate) */
  skipRegenerate?: boolean | undefined;
}

interface ComposeTestResult {
  passed: boolean;
  /** Duration of the entire test run in ms */
  durationMs: number;
  /** Test output (stdout) */
  testOutput: string;
  /** Container logs (captured on failure) */
  containerLogs?: string | undefined;
  /** Error message if something went wrong */
  error?: string | undefined;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

// ─── Core ───────────────────────────────────────────────────────────────

/**
 * Run the compose test workflow.
 */
export async function runComposeTests(options: ComposeTestOptions): Promise<ComposeTestResult> {
  const { strategyDir, baseUrl, healthTimeoutMs = 60_000, keepAlive = false } = options;

  const start = Date.now();
  const projectName = `caira-test-${basename(strategyDir)}`;

  // Validate deployment strategy directory
  const composeFile = resolve(strategyDir, 'docker-compose.yml');
  if (!existsSync(composeFile)) {
    return {
      passed: false,
      durationMs: Date.now() - start,
      testOutput: '',
      error: `docker-compose.yml not found in ${strategyDir}`
    };
  }

  // 0. Regenerate deployment strategies from components to ensure no drift
  const repoRoot = resolve(import.meta.dirname ?? '.', '..');
  if (!options.skipRegenerate) {
    log('Regenerating deployment strategies from components...');
    const samplesDir = DEPLOYMENT_STRATEGIES_ROOT;
    try {
      await generate({ repoRoot, samplesDir, clean: true });
      log('Deployment strategies regenerated successfully.');
    } catch (err) {
      return {
        passed: false,
        durationMs: Date.now() - start,
        testOutput: '',
        error: `Deployment strategy regeneration failed: ${err instanceof Error ? err.message : String(err)}`
      };
    }

    // Generate .env files from the canonical infra Terraform deployment (same as dev:azure).
    // outputOnly: true skips terraform apply — just reads existing state and writes .env.
    // This replaces the old save/restore approach that broke when .env files were missing.
    try {
      const deployResult = await ensureDeploy({ outputOnly: true });
      log(`Generated .env files from CAIRA deployment: ${deployResult.outputs.ai_foundry_name}`);
    } catch (err) {
      // In mock mode, missing Terraform state is fine — .env isn't needed for mocks.
      // In Azure mode, this is fatal.
      if (options.mockMode === false) {
        return {
          passed: false,
          durationMs: Date.now() - start,
          testOutput: '',
          error: `Failed to generate .env from CAIRA deployment: ${err instanceof Error ? err.message : String(err)}`
        };
      }
      log(
        `Warning: could not generate .env from CAIRA deployment (OK for mock mode): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Generate mock overlay for testing (skip when mockMode is explicitly false — L6 uses real Azure)
  const overlayPath = options.mockMode === false ? null : await generateTestOverlay(strategyDir, repoRoot);
  const composeFiles = getComposeFiles(strategyDir, overlayPath);

  // Mock mode: explicit option > default to true when overlay is present
  const mockMode = options.mockMode ?? overlayPath !== null;

  log(`Starting compose stack for: ${basename(strategyDir)}`);

  // Ensure the azurecli external volume exists so `docker compose up` doesn't
  // fail with "volume not found". In mock mode, it will just be empty.
  // Then fix ownership so the azcred sidecar (uid 65532) can read the
  // Azure CLI credentials injected by azure-login.ts (which run as uid 1000).
  await ensureAzurecliVolume();
  await fixAzurecliPermissions();

  try {
    // 1. Start compose stack
    log('Running docker compose up...');
    const upResult = await runCommand(
      'docker',
      ['compose', ...composeFiles, '-p', projectName, 'up', '-d', '--build'],
      { cwd: strategyDir, timeoutMs: 300_000 } // 5 min for build
    );

    if (upResult.stderr && !upResult.stderr.includes('Started') && !upResult.stderr.includes('Running')) {
      // Docker compose outputs progress to stderr, so only treat as error if it looks like one
      const lowerStderr = upResult.stderr.toLowerCase();
      if (lowerStderr.includes('error') || lowerStderr.includes('failed')) {
        return {
          passed: false,
          durationMs: Date.now() - start,
          testOutput: upResult.stdout,
          error: `Compose up failed: ${upResult.stderr}`
        };
      }
    }

    // 2. Resolve frontend base URL across host/container networking modes.
    const frontendBaseUrlCandidates: string[] = [];
    if (baseUrl) {
      frontendBaseUrlCandidates.push(normalizeBaseUrl(baseUrl));
    }

    // Published host ports are the most reliable default in non-devcontainer runs.
    frontendBaseUrlCandidates.push('http://127.0.0.1:8080');
    frontendBaseUrlCandidates.push('http://localhost:8080');

    // Also try bridge-network IP for nested-Docker devcontainer scenarios.
    const frontendIp = await discoverContainerIp(projectName, 'frontend');
    if (frontendIp) {
      const frontendIpUrl = `http://${frontendIp}:8080`;
      frontendBaseUrlCandidates.push(frontendIpUrl);
      log(`Discovered frontend container IP candidate: ${frontendIpUrl}`);
    }

    const dedupedBaseUrls = [...new Set(frontendBaseUrlCandidates)];
    const healthCandidates = dedupedBaseUrls.map((url) => `${url}/health`);

    // 3. Wait for health
    log(`Waiting for services to become healthy (timeout: ${String(healthTimeoutMs / 1000)}s)...`);
    log(`Health probe candidates: ${healthCandidates.join(', ')}`);
    const healthyUrl = await waitForAnyHealthy(healthCandidates, healthTimeoutMs);

    if (!healthyUrl) {
      // Capture logs before failing
      const logs = await captureContainerLogs(composeFiles, projectName, strategyDir);
      return {
        passed: false,
        durationMs: Date.now() - start,
        testOutput: '',
        containerLogs: logs,
        error: `Services did not become healthy within ${String(healthTimeoutMs / 1000)}s`
      };
    }

    const effectiveBaseUrl = healthyUrl.replace(/\/health$/, '');
    log(`Services healthy via ${effectiveBaseUrl}`);

    log('Services are healthy. Running E2E tests...');

    // 4. Run E2E tests
    const e2eDir = resolve(import.meta.dirname ?? '.', '..', 'testing', 'e2e');

    // Install deps if needed
    if (!existsSync(resolve(e2eDir, 'node_modules'))) {
      log('Installing E2E test dependencies...');
      await runCommand('npm', ['install'], { cwd: e2eDir, timeoutMs: 60_000 });
    }

    const testResult = await runCommand('npx', ['vitest', 'run', '--reporter', 'verbose'], {
      cwd: e2eDir,
      timeoutMs: 120_000,
      env: {
        E2E_BASE_URL: effectiveBaseUrl,
        ...(mockMode ? { E2E_MOCK_MODE: 'true' } : {})
      }
    });

    const passed = !testResult.stderr.includes('FAIL') && !testResult.stdout.includes('FAIL');

    // 5. Capture logs on failure
    let containerLogs: string | undefined;
    if (!passed) {
      containerLogs = await captureContainerLogs(composeFiles, projectName, strategyDir);
    }

    return {
      passed,
      durationMs: Date.now() - start,
      testOutput: testResult.stdout + testResult.stderr,
      containerLogs
    };
  } finally {
    // 6. Tear down (unless keepAlive)
    if (!keepAlive) {
      log('Tearing down compose stack...');
      await runCommand(
        'docker',
        ['compose', ...composeFiles, '-p', projectName, 'down', '--volumes', '--remove-orphans'],
        { cwd: strategyDir, timeoutMs: 60_000 }
      );
      log('Stack torn down.');
    } else {
      log('Keeping stack alive (--keep-alive).');
    }

    // 7. Clean up temporary overlay file
    await cleanupOverlay(overlayPath);
  }
}

// ─── CLI ────────────────────────────────────────────────────────────────

function printUsage(): void {
  process.stdout.write(`
Compose Test Runner — run E2E tests against a docker compose stack

Usage:
  node scripts/compose-test-runner.ts [options]

Options:
  --strategy <path>      Path to the deployment strategy directory (required)
  --base-url <url>       Base URL for the frontend BFF (default: auto-discovered)
  --health-timeout <ms>  Health check timeout in ms (default: 60000)
  --keep-alive           Keep the stack running after tests
  --no-mock              Disable mock mode (use real Azure inference)
  --skip-regenerate      Skip regenerating deployment strategies before testing
  --help                 Show this help message

Example:
  node scripts/compose-test-runner.ts \\
    --strategy deployment-strategies/foundry_agentic_app/typescript-openai-agent-sdk-aca
`);
}

function parseArgs(args: string[]): ComposeTestOptions | null {
  let strategyDir: string | undefined;
  let baseUrl: string | undefined;
  let healthTimeoutMs: number | undefined;
  let keepAlive = false;
  let mockMode: boolean | undefined;
  let skipRegenerate = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    switch (arg) {
      case '--strategy':
        strategyDir = args[++i];
        break;
      case '--base-url':
        baseUrl = args[++i];
        break;
      case '--health-timeout':
        healthTimeoutMs = Number(args[++i]);
        break;
      case '--keep-alive':
        keepAlive = true;
        break;
      case '--no-mock':
        mockMode = false;
        break;
      case '--skip-regenerate':
        skipRegenerate = true;
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

  if (!strategyDir) {
    logError('--strategy <path> is required');
    printUsage();
    return null;
  }

  return {
    strategyDir: resolveStrategyPath(strategyDir),
    baseUrl,
    healthTimeoutMs,
    keepAlive,
    mockMode,
    skipRegenerate
  };
}

// ─── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);
  if (!options) {
    process.exit(1);
  }

  const result = await runComposeTests(options);

  // Print summary
  process.stdout.write('\n');
  process.stdout.write('═'.repeat(60) + '\n');
  process.stdout.write(`  Compose Test Result: ${result.passed ? 'PASSED' : 'FAILED'}\n`);
  process.stdout.write(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s\n`);
  if (result.error) {
    process.stdout.write(`  Error: ${result.error}\n`);
  }
  process.stdout.write('═'.repeat(60) + '\n');

  // Always show test output when tests failed — this contains assertion errors,
  // stack traces, and the vitest summary which is essential for debugging.
  if (!result.passed && result.testOutput) {
    process.stdout.write('\n--- Test Output ---\n');
    process.stdout.write(result.testOutput);
    process.stdout.write('\n--- End Test Output ---\n');
  }

  if (result.containerLogs) {
    process.stdout.write('\n--- Container Logs ---\n');
    process.stdout.write(result.containerLogs);
    process.stdout.write('--- End Container Logs ---\n');
  }

  process.exit(result.passed ? 0 : 1);
}

// Only run CLI when this file is the entry point
const isMain = import.meta.url === `file://${process.argv[1]}` || import.meta.filename === process.argv[1];

if (isMain) {
  main().catch((err: unknown) => {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
