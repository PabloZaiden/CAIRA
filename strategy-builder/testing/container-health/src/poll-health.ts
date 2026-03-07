/**
 * Health endpoint polling with exponential backoff.
 *
 * This module is intentionally Docker-free so it can be unit-tested
 * without any container runtime.
 */

import type { PollHealthOptions, PollHealthResult } from './types.ts';

/**
 * Poll a health endpoint with exponential backoff until it returns HTTP 200
 * or the timeout is exceeded.
 */
export async function pollHealth(options: PollHealthOptions): Promise<PollHealthResult> {
  const { url, timeout, initialDelay = 250, maxDelay = 5_000, backoffMultiplier = 2, signal } = options;

  const start = Date.now();
  let delay = initialDelay;
  let attempts = 0;
  let lastStatus: number | undefined;
  let lastBody: string | undefined;
  let lastError: string | undefined;

  while (Date.now() - start < timeout) {
    if (signal?.aborted) {
      return {
        healthy: false,
        durationMs: Date.now() - start,
        attempts,
        error: 'Polling aborted'
      };
    }

    attempts++;

    const controller = new AbortController();
    try {
      // Per-request timeout: 5s or remaining time, whichever is less
      const remaining = timeout - (Date.now() - start);
      const requestTimeout = Math.min(5_000, remaining);
      const timer = setTimeout(() => controller.abort(), requestTimeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });

      clearTimeout(timer);

      lastStatus = response.status;
      lastBody = await response.text();

      if (response.status === 200) {
        return {
          healthy: true,
          status: response.status,
          body: lastBody,
          durationMs: Date.now() - start,
          attempts
        };
      }

      lastError = `HTTP ${response.status}`;
    } catch (err: unknown) {
      if (signal?.aborted) {
        return {
          healthy: false,
          durationMs: Date.now() - start,
          attempts,
          error: 'Polling aborted'
        };
      }

      const errMsg = err instanceof Error ? err.message : String(err);

      // When our per-request AbortController fires (timeout expired), don't
      // overwrite a meaningful lastError (e.g. "HTTP 503") with a generic
      // "This operation was aborted" — the previous HTTP status is more useful
      // for diagnostics.
      if (controller.signal.aborted && lastError) {
        // keep lastError as-is
      } else {
        lastError = errMsg;
      }
    }

    // Wait before next attempt (but not longer than remaining time)
    const remaining = timeout - (Date.now() - start);
    if (remaining <= 0) break;

    const waitTime = Math.min(delay, remaining, maxDelay);
    await sleep(waitTime, signal);

    delay = Math.min(delay * backoffMultiplier, maxDelay);
  }

  return {
    healthy: false,
    status: lastStatus,
    body: lastBody,
    durationMs: Date.now() - start,
    attempts,
    error: lastError ?? `Timeout after ${timeout}ms`
  };
}

/** Sleep for the given duration, respecting an optional abort signal */
function sleep(ms: number, signal?: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}
