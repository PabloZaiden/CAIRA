/**
 * Container Health Validator
 *
 * Builds a Docker image from a Dockerfile, starts a container,
 * polls the health endpoint with exponential backoff, and cleans up.
 */

import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';

import { execa, type ExecaError } from 'execa';

import { parseEnvFile } from './env-parser.ts';
import { pollHealth } from './poll-health.ts';
import type { CleanupResult, PollHealthResult, ValidateContainerOptions, ValidateContainerResult } from './types.ts';

interface HealthPollCandidate {
  url: string;
  result: PollHealthResult;
}

/**
 * Validate a container's health by building an image, starting a container,
 * and polling the health endpoint.
 */
export async function validateContainer(options: ValidateContainerOptions): Promise<ValidateContainerResult> {
  const totalStart = Date.now();

  const dockerfile = resolve(options.dockerfile);
  const context = options.context ?? dirname(dockerfile);
  const healthEndpoint = options.healthEndpoint;
  const containerPort = options.containerPort ?? options.port ?? 3000;
  const hostPort = options.port ?? 0; // 0 means Docker picks a random port
  const timeout = options.timeout ?? 60_000;
  const imageTag = options.imageTag ?? `caira-health-check-${randomBytes(4).toString('hex')}`;

  let containerId: string | undefined;
  let actualHostPort: number | undefined;
  const cleanup: CleanupResult = {
    containerRemoved: false,
    imageRemoved: false
  };

  // --- Build ---
  const buildStart = Date.now();
  try {
    await execa('docker', ['build', '-f', dockerfile, '-t', imageTag, context]);
  } catch (err: unknown) {
    const msg = isExecaError(err) ? err.stderr || err.message : String(err);
    return {
      passed: false,
      imageTag,
      buildDurationMs: Date.now() - buildStart,
      healthCheckDurationMs: 0,
      totalDurationMs: Date.now() - totalStart,
      error: `Docker build failed: ${msg}`,
      cleanup
    };
  }
  const buildDurationMs = Date.now() - buildStart;

  // --- Start container ---
  const healthCheckStart = Date.now();
  try {
    const runArgs: string[] = [
      'run',
      '-d',
      '--rm',
      '-p',
      hostPort === 0 ? `${containerPort}` : `${hostPort}:${containerPort}`
    ];

    // Add env file if specified
    if (options.envFile) {
      const entries = await parseEnvFile(resolve(options.envFile));
      for (const entry of entries) {
        runArgs.push('-e', `${entry.key}=${entry.value}`);
      }
    }

    // Add explicit env vars
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        runArgs.push('-e', `${key}=${value}`);
      }
    }

    runArgs.push(imageTag);

    const { stdout } = await execa('docker', runArgs);
    containerId = stdout.trim();

    if (hostPort === 0) {
      // Try to determine the mapped host port (for reporting purposes)
      try {
        const { stdout: portOutput } = await execa('docker', ['port', containerId, String(containerPort)]);
        const match = portOutput.match(/:(\d+)$/m);
        if (match?.[1]) {
          actualHostPort = parseInt(match[1], 10);
        }
      } catch {
        // Port query may fail; not critical since we connect via container IP
      }
    } else {
      actualHostPort = hostPort;
    }

    const healthUrls = await getContainerHealthUrls(containerId, containerPort, healthEndpoint, actualHostPort);
    const { winner, failures } = await pollHealthAcrossUrls(healthUrls, timeout);
    const bestFailure = pickBestFailure(failures);

    const healthCheckDurationMs = Date.now() - healthCheckStart;

    if (winner) {
      return {
        passed: true,
        imageTag,
        containerId,
        hostPort: actualHostPort,
        buildDurationMs,
        healthCheckDurationMs,
        totalDurationMs: Date.now() - totalStart,
        healthStatus: winner.result.status,
        healthBody: winner.result.body,
        cleanup: options.keepAlive ? cleanup : await cleanupContainer(containerId, imageTag, cleanup)
      };
    }

    const failureSummary = bestFailure
      ? `${bestFailure.url}: ${bestFailure.result.error ?? `HTTP ${String(bestFailure.result.status ?? 'unknown')}`}`
      : 'No health polling result available';

    return {
      passed: false,
      imageTag,
      containerId,
      hostPort: actualHostPort,
      buildDurationMs,
      healthCheckDurationMs,
      totalDurationMs: Date.now() - totalStart,
      healthStatus: bestFailure?.result.status,
      healthBody: bestFailure?.result.body,
      error: `Health check failed after trying ${healthUrls.length} URL(s): ${failureSummary}`,
      cleanup: await cleanupContainer(containerId, imageTag, cleanup)
    };
  } catch (err: unknown) {
    const msg = isExecaError(err) ? err.stderr || err.message : String(err);
    const cleanedUp = containerId
      ? await cleanupContainer(containerId, imageTag, cleanup)
      : await cleanupImage(imageTag, cleanup);

    return {
      passed: false,
      imageTag,
      containerId,
      hostPort: actualHostPort,
      buildDurationMs,
      healthCheckDurationMs: Date.now() - healthCheckStart,
      totalDurationMs: Date.now() - totalStart,
      error: `Container start/health check failed: ${msg}`,
      cleanup: cleanedUp
    };
  }
}

/**
 * Build candidate URLs to reach the container health endpoint across host
 * and nested-Docker devcontainer environments.
 */
async function getContainerHealthUrls(
  containerId: string,
  containerPort: number,
  healthEndpoint: string,
  hostPort: number | undefined
): Promise<string[]> {
  const urls: string[] = [];
  const add = (url: string): void => {
    if (!urls.includes(url)) {
      urls.push(url);
    }
  };

  if (hostPort !== undefined) {
    add(`http://127.0.0.1:${String(hostPort)}${healthEndpoint}`);
    add(`http://localhost:${String(hostPort)}${healthEndpoint}`);
    add(`http://host.docker.internal:${String(hostPort)}${healthEndpoint}`);

    const gateway = await getDockerBridgeGateway();
    if (gateway) {
      add(`http://${gateway}:${String(hostPort)}${healthEndpoint}`);
    }
  }

  const containerIp = await getContainerBridgeIp(containerId);
  if (containerIp) {
    add(`http://${containerIp}:${String(containerPort)}${healthEndpoint}`);
  }

  add(`http://127.0.0.1:${String(containerPort)}${healthEndpoint}`);
  return urls;
}

/** Get the container's bridge-network IP address. */
async function getContainerBridgeIp(containerId: string): Promise<string | undefined> {
  try {
    const { stdout: containerIp } = await execa('docker', [
      'inspect',
      '--format',
      '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}',
      containerId
    ]);
    const ip = containerIp.trim();
    return ip || undefined;
  } catch {
    return undefined;
  }
}

/** Get the Docker bridge gateway IP, if available. */
async function getDockerBridgeGateway(): Promise<string | undefined> {
  try {
    const { stdout } = await execa('docker', [
      'network',
      'inspect',
      'bridge',
      '--format',
      '{{(index .IPAM.Config 0).Gateway}}'
    ]);
    const gateway = stdout.trim();
    return gateway || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Poll all candidate URLs concurrently and return the first one that becomes healthy.
 * This avoids committing to a single network path when Docker networking differs
 * by environment (native host vs nested-Docker devcontainer).
 */
async function pollHealthAcrossUrls(
  urls: string[],
  timeout: number
): Promise<{ winner?: HealthPollCandidate; failures: HealthPollCandidate[] }> {
  if (urls.length === 0) {
    return { failures: [] };
  }

  const controllers = urls.map(() => new AbortController());
  const polls = urls.map((url, index) =>
    pollHealth({ url, timeout, signal: controllers[index]?.signal }).then((result) => {
      const candidate: HealthPollCandidate = { url, result };
      if (result.healthy) {
        return candidate;
      }
      throw candidate;
    })
  );

  try {
    const winner = await Promise.any(polls);
    for (let i = 0; i < controllers.length; i++) {
      if (urls[i] !== winner.url) {
        controllers[i]?.abort();
      }
    }
    return { winner, failures: [] };
  } catch (error: unknown) {
    const failures = extractFailedCandidates(error);
    return { failures };
  }
}

function extractFailedCandidates(error: unknown): HealthPollCandidate[] {
  if (!(error instanceof AggregateError)) {
    return [];
  }

  const failures: HealthPollCandidate[] = [];
  for (const candidate of error.errors) {
    if (isHealthPollCandidate(candidate)) {
      failures.push(candidate);
    }
  }
  return failures;
}

function isHealthPollCandidate(value: unknown): value is HealthPollCandidate {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('url' in value) || !('result' in value)) {
    return false;
  }
  const url = value.url;
  const result = value.result;
  return (
    typeof url === 'string' &&
    typeof result === 'object' &&
    result !== null &&
    'healthy' in result &&
    'durationMs' in result &&
    'attempts' in result
  );
}

function pickBestFailure(failures: HealthPollCandidate[]): HealthPollCandidate | undefined {
  return failures.find((failure) => failure.result.status !== undefined) ?? failures[0];
}

/** Stop and remove a container, then remove the image */
async function cleanupContainer(containerId: string, imageTag: string, cleanup: CleanupResult): Promise<CleanupResult> {
  try {
    // --rm flag means container is removed on stop, but force-remove just in case
    await execa('docker', ['rm', '-f', containerId]);
    cleanup.containerRemoved = true;
  } catch {
    // Container may already be removed (--rm flag)
    cleanup.containerRemoved = true;
  }

  return cleanupImage(imageTag, cleanup);
}

/** Remove a Docker image */
async function cleanupImage(imageTag: string, cleanup: CleanupResult): Promise<CleanupResult> {
  try {
    await execa('docker', ['rmi', '-f', imageTag]);
    cleanup.imageRemoved = true;
  } catch {
    // Image removal is best-effort
  }

  return cleanup;
}

/** Type guard for execa errors */
function isExecaError(err: unknown): err is ExecaError {
  return err !== null && typeof err === 'object' && 'stderr' in err && 'message' in err;
}
