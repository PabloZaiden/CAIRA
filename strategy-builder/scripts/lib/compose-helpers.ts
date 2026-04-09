/**
 * Shared helpers for Docker Compose orchestration.
 *
 * Extracted from compose-test-runner.ts so that both the automated test runner
 * and the interactive dev-compose script can reuse the same logic for mock
 * overlay generation, container IP discovery, health polling, etc.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { writeFile, unlink } from 'node:fs/promises';
import { resolve, basename } from 'node:path';

const execFileAsync = promisify(execFile);

// ─── Logging ────────────────────────────────────────────────────────────

export function log(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${timestamp}] ${message}\n`);
}

export function logError(message: string): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  process.stderr.write(`[${timestamp}] ERROR: ${message}\n`);
}

// ─── Command execution ─────────────────────────────────────────────────

export async function runCommand(
  cmd: string,
  args: string[],
  options?: {
    cwd?: string | undefined;
    timeoutMs?: number | undefined;
    env?: NodeJS.ProcessEnv | undefined;
  }
): Promise<{ success: boolean; exitCode: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(cmd, args, {
      cwd: options?.cwd,
      timeout: options?.timeoutMs ?? 120_000,
      maxBuffer: 10 * 1024 * 1024, // 10 MB
      env: options?.env ? { ...process.env, ...options.env } : undefined
    });
    return { success: true, exitCode: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string; message?: string; code?: number | string | undefined };
    return {
      success: false,
      exitCode: typeof error.code === 'number' ? error.code : 1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? error.message ?? String(err)
    };
  }
}

// ─── Health checking ────────────────────────────────────────────────────

/**
 * Poll a URL until it returns 200 or timeout is reached.
 */
export async function waitForHealthy(url: string, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  let delay = 500;

  while (Date.now() - start < timeoutMs) {
    try {
      const controller = new AbortController();
      const requestTimeout = setTimeout(() => controller.abort(), 5_000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(requestTimeout);

      if (response.status === 200) return true;
    } catch {
      // Connection refused or other error — keep trying
    }

    const remaining = timeoutMs - (Date.now() - start);
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(delay, remaining)));
    delay = Math.min(delay * 2, 5_000);
  }

  return false;
}

/**
 * Poll multiple health URLs and return the first URL that becomes healthy.
 *
 * Useful when host/container networking differs across environments and the same
 * service may be reachable via localhost OR bridge-network IP.
 */
export async function waitForAnyHealthy(urls: string[], timeoutMs: number): Promise<string | null> {
  const deduped = [...new Set(urls.filter((u) => u.length > 0))];
  if (deduped.length === 0) return null;

  const start = Date.now();
  let delay = 500;

  while (Date.now() - start < timeoutMs) {
    for (const url of deduped) {
      try {
        const controller = new AbortController();
        const requestTimeout = setTimeout(() => controller.abort(), 5_000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(requestTimeout);

        if (response.status === 200) return url;
      } catch {
        // Keep trying all candidates
      }
    }

    const remaining = timeoutMs - (Date.now() - start);
    if (remaining <= 0) break;
    await new Promise((r) => setTimeout(r, Math.min(delay, remaining)));
    delay = Math.min(delay * 2, 5_000);
  }

  return null;
}

// ─── Container IP discovery ─────────────────────────────────────────────

/**
 * Discover the container IP for a given compose service.
 *
 * In devcontainers, Docker port publishing maps to the Docker host, not the
 * devcontainer. We use `docker inspect` to find the container's IP on the
 * bridge network so we can reach it directly.
 */
export async function discoverContainerIp(projectName: string, serviceName: string): Promise<string | null> {
  const containerName = `${projectName}-${serviceName}-1`;
  const result = await runCommand('docker', [
    'inspect',
    '-f',
    '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
    containerName
  ]);
  const ip = result.stdout.trim();
  // Validate it looks like a valid IPv4 address
  if (!ip || !/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ip)) {
    return null;
  }
  return ip;
}

// ─── Mock Overlay ───────────────────────────────────────────────────────

/**
 * Agent variant → mock service mapping.
 *
 * For each agent variant, defines:
 * - mockDir: directory name under testing/mocks/ containing the mock Dockerfile
 * - port: port the mock listens on
 * - endpointEnvVar: the agent env var to override with the mock URL
 */
export const MOCK_MAP: Record<string, { mockDir: string; port: number; endpointEnvVar: string }> = {
  'foundry-agent-service': {
    mockDir: 'ai-mock',
    port: 8100,
    endpointEnvVar: 'AZURE_AI_PROJECT_ENDPOINT'
  },
  'openai-agent-sdk': {
    mockDir: 'ai-mock',
    port: 8100,
    endpointEnvVar: 'AZURE_OPENAI_ENDPOINT'
  },
  'microsoft-agent-framework': {
    mockDir: 'ai-mock',
    port: 8100,
    endpointEnvVar: 'AZURE_OPENAI_ENDPOINT'
  }
};

/**
 * Detect the agent variant from a strategy directory or sample directory name.
 * Supports both historical <language>-<variant> names and the current
 * <language>-<variant>-<infra-variant> shape. When available, strategy
 * provenance is the source of truth.
 */
export function detectAgentVariant(samplePathOrName: string): string | null {
  const provenancePath = resolve(samplePathOrName, 'strategy.provenance.json');
  if (existsSync(provenancePath)) {
    try {
      const provenance = JSON.parse(readFileSync(provenancePath, 'utf-8')) as {
        flavor?: { agentVariant?: string | undefined } | undefined;
      };
      if (typeof provenance.flavor?.agentVariant === 'string') {
        return provenance.flavor.agentVariant;
      }
    } catch {
      // Fall back to directory-name detection below.
    }
  }

  const sampleDirName = basename(samplePathOrName);
  for (const variant of Object.keys(MOCK_MAP)) {
    if (sampleDirName === variant || sampleDirName.endsWith(`-${variant}`) || sampleDirName.includes(`-${variant}-`)) {
      return variant;
    }
  }
  return null;
}

/**
 * Generate a temporary docker-compose test overlay file.
 *
 * This overlay adds:
 * - A mock service built from testing/mocks/<mockDir>/
 * - Environment overrides to point the agent at the mock
 * - SKIP_AUTH=true on both agent and API (for business routes only)
 * - A dependency from agent to mock being healthy
 *
 * The real azcred sidecar from the base compose is preserved so
 * that /identity always attempts real credential validation. The
 * dependency is relaxed to service_started (not service_healthy) so
 * the stack does not block when the azurecli volume has no credentials.
 *
 * Returns the path to the generated overlay file, or null if no mock is available.
 */
export async function generateTestOverlay(sampleDir: string, strategyBuilderRoot: string): Promise<string | null> {
  const sampleName = basename(sampleDir);
  const variant = detectAgentVariant(sampleDir);

  if (!variant) {
    log(`No mock mapping found for sample "${sampleName}" — running without mock overlay`);
    return null;
  }

  const mock = MOCK_MAP[variant];
  if (!mock) {
    log(`No mock mapping found for variant "${variant}" — running without mock overlay`);
    return null;
  }
  const mockBuildContext = resolve(strategyBuilderRoot, 'testing', 'mocks', mock.mockDir);

  if (!existsSync(mockBuildContext)) {
    log(`Mock directory not found: ${mockBuildContext} — running without mock overlay`);
    return null;
  }

  const overlay = `# Auto-generated test overlay — do not commit.
# Generated by compose helpers for testing with mock services.
#
# The real azcred sidecar is preserved from the base compose so that
# /identity always attempts real credential validation. IDENTITY_ENDPOINT
# and IMDS_ENDPOINT are NOT cleared — they still point at azcred.
services:
  mock:
    build:
      context: ${mockBuildContext}
      dockerfile: Dockerfile
    ports:
      - "${mock.port}:${mock.port}"
    networks:
      - caira-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1:${mock.port}/health"]
      interval: 10s
      timeout: 3s
      start_period: 5s
      retries: 3

  agent:
    environment:
      ${mock.endpointEnvVar}: http://mock:${mock.port}
      SKIP_AUTH: "true"
    depends_on:
      mock:
        condition: service_healthy
      azcred:
        condition: service_started

  api:
    environment:
      SKIP_AUTH: "true"
    depends_on:
      azcred:
        condition: service_started

  frontend:
    environment:
      SKIP_AUTH: "true"

`;

  const overlayPath = resolve(sampleDir, '.docker-compose.test-overlay.yml');
  await writeFile(overlayPath, overlay);
  return overlayPath;
}

// ─── Azure CLI volume helpers ───────────────────────────────────────────

const AZURECLI_VOLUME = 'azurecli';

/**
 * Ensure the `azurecli` Docker volume exists.
 *
 * The base docker-compose.yml declares `azurecli: external: true`, which
 * fails if the volume doesn't exist. This helper creates an empty volume
 * when none exists so that `docker compose up` succeeds even in CI or on
 * a fresh checkout (the azcred sidecar simply won't have credentials).
 */
export async function ensureAzurecliVolume(): Promise<void> {
  const inspect = await runCommand('docker', ['volume', 'inspect', AZURECLI_VOLUME], {
    timeoutMs: 10_000
  });
  // docker volume inspect returns output on stdout when the volume exists,
  // and an error on stderr when it doesn't.
  if (inspect.stdout.trim().length > 0 && !inspect.stderr.toLowerCase().includes('no such volume')) {
    return; // Volume already exists
  }
  log(`Creating Docker volume '${AZURECLI_VOLUME}'...`);
  await runCommand('docker', ['volume', 'create', AZURECLI_VOLUME], { timeoutMs: 10_000 });
}

/**
 * Fix file ownership in the `azurecli` volume for the azcred container.
 *
 * The az credential sidecar runs as uid 65532 (nonroot), which is the
 * built-in non-root user in the `mcr.microsoft.com/azure-cli` base image.
 * Files injected by `azure-login.ts` or `az login` may be owned by a
 * different uid (e.g. 1000 from devcontainer). The `config` file has
 * mode 600 — only the owner can read it. This chowns everything to 65532
 * so the azcred sidecar can access the credentials.
 */
export async function fixAzurecliPermissions(): Promise<void> {
  log('Fixing azurecli volume permissions for azcred sidecar (uid 65532)...');
  const result = await runCommand(
    'docker',
    ['run', '--rm', '-v', `${AZURECLI_VOLUME}:/data`, 'busybox', 'chown', '-R', '65532:65532', '/data'],
    { timeoutMs: 15_000 }
  );
  if (result.stderr && result.stderr.toLowerCase().includes('error')) {
    logError(`Warning: could not fix volume permissions: ${result.stderr}`);
  }
}

/**
 * Clean up a temporary overlay file.
 */
export async function cleanupOverlay(overlayPath: string | null): Promise<void> {
  if (!overlayPath) return;
  try {
    await unlink(overlayPath);
  } catch {
    // Ignore cleanup errors
  }
}

// ─── Compose file resolution ────────────────────────────────────────────

/**
 * Get the docker compose file arguments for a sample directory.
 *
 * Uses docker-compose.yml as the base. If a test overlay has been generated,
 * includes it as a second compose file. Also checks for a legacy
 * docker-compose.test.yml in the sample dir (for backwards compatibility).
 */
export function getComposeFiles(sampleDir: string, overlayPath: string | null): string[] {
  const files = ['-f', resolve(sampleDir, 'docker-compose.yml')];

  if (overlayPath) {
    files.push('-f', overlayPath);
  } else {
    // Legacy fallback: check for in-sample docker-compose.test.yml
    const legacyOverlay = resolve(sampleDir, 'docker-compose.test.yml');
    if (existsSync(legacyOverlay)) {
      files.push('-f', legacyOverlay);
    }
  }

  return files;
}

/**
 * Capture logs from all containers in the compose stack.
 */
export async function captureContainerLogs(composeFiles: string[], projectName: string, cwd: string): Promise<string> {
  log('Capturing container logs...');
  const result = await runCommand(
    'docker',
    ['compose', ...composeFiles, '-p', projectName, 'logs', '--no-color', '--tail', '200'],
    { cwd, timeoutMs: 30_000 }
  );
  return result.stdout + result.stderr;
}
