/**
 * Wait for a service to become healthy by polling its health endpoint.
 *
 * Uses exponential backoff. Designed for E2E test setup — waits until
 * the service under test is ready before running tests.
 */

export interface WaitForHealthyOptions {
  /** Base URL of the service (e.g., "http://localhost:4000") */
  url: string;
  /** Health endpoint path (default: "/health") */
  path?: string | undefined;
  /** Maximum time to wait in ms (default: 30000) */
  timeoutMs?: number | undefined;
  /** Initial delay between polls in ms (default: 200) */
  initialDelayMs?: number | undefined;
  /** Maximum delay between polls in ms (default: 5000) */
  maxDelayMs?: number | undefined;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number | undefined;
  /** AbortSignal to cancel polling */
  signal?: AbortSignal | undefined;
}

export interface WaitForHealthyResult {
  healthy: boolean;
  attempts: number;
  elapsedMs: number;
  lastError?: string | undefined;
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end--;
  }
  return value.slice(0, end);
}

/**
 * Poll a service's health endpoint until it returns 200 or timeout is reached.
 */
export async function waitForHealthy(options: WaitForHealthyOptions): Promise<WaitForHealthyResult> {
  const {
    url,
    path = '/health',
    timeoutMs = 30_000,
    initialDelayMs = 200,
    maxDelayMs = 5_000,
    backoffMultiplier = 2,
    signal
  } = options;

  const healthUrl = `${stripTrailingSlashes(url)}${path}`;
  const start = Date.now();
  let attempts = 0;
  let delay = initialDelayMs;
  let lastError: string | undefined;

  while (Date.now() - start < timeoutMs) {
    if (signal?.aborted) {
      return { healthy: false, attempts, elapsedMs: Date.now() - start, lastError: 'Aborted' };
    }

    attempts++;

    try {
      const controller = new AbortController();
      const requestTimeout = setTimeout(() => controller.abort(), 5_000);

      const response = await fetch(healthUrl, { signal: controller.signal });
      clearTimeout(requestTimeout);

      if (response.status === 200) {
        return { healthy: true, attempts, elapsedMs: Date.now() - start };
      }

      lastError = `HTTP ${String(response.status)}`;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Wait before next attempt (but don't exceed remaining time)
    const remaining = timeoutMs - (Date.now() - start);
    if (remaining <= 0) break;

    await new Promise((resolve) => setTimeout(resolve, Math.min(delay, remaining)));
    delay = Math.min(delay * backoffMultiplier, maxDelayMs);
  }

  return { healthy: false, attempts, elapsedMs: Date.now() - start, lastError };
}
