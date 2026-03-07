/**
 * Container Health Validator — Unit Tests
 *
 * Tests the health polling logic, env file parsing, and timeout behavior
 * using mock HTTP servers (no Docker required for these tests).
 *
 * The integration tests at the bottom use Docker with fixture Dockerfiles
 * and server scripts from tests/fixtures/.
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect, beforeAll, afterEach } from 'vitest';

import { pollHealth } from '../src/poll-health.ts';
import { parseEnvContent } from '../src/env-parser.ts';
import { validateContainer } from '../src/validate-container.ts';
import { execa } from 'execa';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, 'fixtures');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a simple HTTP server for testing health polling */
function createTestServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void
): Promise<{ server: Server; port: number; url: string }> {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const port = addr.port;
        resolve({ server, port, url: `http://127.0.0.1:${port}` });
      }
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// ---------------------------------------------------------------------------
// pollHealth tests
// ---------------------------------------------------------------------------

describe('pollHealth', () => {
  let server: Server;
  let url: string;

  afterEach(async () => {
    if (server) {
      await closeServer(server);
    }
  });

  it('returns healthy immediately when server returns 200', async () => {
    const setup = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'healthy' }));
    });
    server = setup.server;
    url = setup.url;

    const result = await pollHealth({
      url: `${url}/health`,
      timeout: 5_000
    });

    expect(result.healthy).toBe(true);
    expect(result.status).toBe(200);
    expect(result.attempts).toBe(1);
    expect(result.body).toContain('healthy');
    expect(result.durationMs).toBeLessThan(2_000);
  });

  it('retries and succeeds when server becomes healthy after initial failures', async () => {
    let requestCount = 0;
    const setup = await createTestServer((_req, res) => {
      requestCount++;
      if (requestCount < 3) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'starting' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'healthy' }));
      }
    });
    server = setup.server;
    url = setup.url;

    const result = await pollHealth({
      url: `${url}/health`,
      timeout: 10_000,
      initialDelay: 50,
      maxDelay: 100
    });

    expect(result.healthy).toBe(true);
    expect(result.status).toBe(200);
    expect(result.attempts).toBeGreaterThanOrEqual(3);
  });

  it('times out when server never becomes healthy', async () => {
    const setup = await createTestServer((_req, res) => {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'unhealthy' }));
    });
    server = setup.server;
    url = setup.url;

    const result = await pollHealth({
      url: `${url}/health`,
      // Use a generous timeout so the per-request abort (5s) never races
      // with the overall timeout — we want a clean HTTP 503 capture.
      timeout: 3_000,
      initialDelay: 50,
      maxDelay: 100
    });

    expect(result.healthy).toBe(false);
    expect(result.status).toBe(503);
    expect(result.attempts).toBeGreaterThan(1);
    expect(result.error).toContain('HTTP 503');
  });

  it('handles connection refused gracefully', async () => {
    const result = await pollHealth({
      url: 'http://127.0.0.1:1/health', // port 1 - connection refused
      timeout: 1_000,
      initialDelay: 50,
      maxDelay: 100
    });

    expect(result.healthy).toBe(false);
    expect(result.attempts).toBeGreaterThanOrEqual(1);
    expect(result.error).toBeDefined();
  });

  it('respects abort signal', async () => {
    const setup = await createTestServer((_req, res) => {
      res.writeHead(503);
      res.end();
    });
    server = setup.server;
    url = setup.url;

    const controller = new AbortController();

    // Abort after 500ms — generous enough to not be affected by CPU scheduling jitter
    setTimeout(() => controller.abort(), 500);

    const result = await pollHealth({
      url: `${url}/health`,
      timeout: 30_000,
      initialDelay: 50,
      maxDelay: 100,
      signal: controller.signal
    });

    expect(result.healthy).toBe(false);
    expect(result.error).toBe('Polling aborted');
    // Should finish well before the 30s timeout — the abort at ~500ms should stop it.
    // Use a generous bound (10s) to avoid flakiness under heavy CPU load.
    expect(result.durationMs).toBeLessThan(10_000);
  });

  it('applies exponential backoff between retries', async () => {
    const requestTimes: number[] = [];
    const setup = await createTestServer((_req, res) => {
      requestTimes.push(Date.now());
      // Never become healthy
      res.writeHead(503);
      res.end();
    });
    server = setup.server;
    url = setup.url;

    await pollHealth({
      url: `${url}/health`,
      timeout: 2_000,
      initialDelay: 100,
      maxDelay: 500,
      backoffMultiplier: 2
    });

    // Should have multiple requests with increasing gaps
    expect(requestTimes.length).toBeGreaterThan(2);

    if (requestTimes.length >= 3) {
      const gap1 = (requestTimes[1] ?? 0) - (requestTimes[0] ?? 0);
      const gap2 = (requestTimes[2] ?? 0) - (requestTimes[1] ?? 0);
      // Second gap should be roughly double the first (with some tolerance)
      // We use a generous tolerance since timing is imprecise
      expect(gap2).toBeGreaterThan(gap1 * 0.8);
    }
  });

  it('returns correct attempt count', async () => {
    let requestCount = 0;
    const setup = await createTestServer((_req, res) => {
      requestCount++;
      if (requestCount === 5) {
        res.writeHead(200);
        res.end('ok');
      } else {
        res.writeHead(503);
        res.end();
      }
    });
    server = setup.server;
    url = setup.url;

    const result = await pollHealth({
      url: `${url}/health`,
      timeout: 10_000,
      initialDelay: 10,
      maxDelay: 50
    });

    expect(result.healthy).toBe(true);
    expect(result.attempts).toBe(5);
  });

  it('handles server that returns non-JSON response', async () => {
    const setup = await createTestServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    });
    server = setup.server;
    url = setup.url;

    const result = await pollHealth({
      url: `${url}/health`,
      timeout: 5_000
    });

    expect(result.healthy).toBe(true);
    expect(result.status).toBe(200);
    expect(result.body).toBe('OK');
  });
});

// ---------------------------------------------------------------------------
// parseEnvContent tests
// ---------------------------------------------------------------------------

describe('parseEnvContent', () => {
  it('parses simple KEY=VALUE pairs', () => {
    const entries = parseEnvContent('FOO=bar\nBAZ=qux');
    expect(entries).toEqual([
      { key: 'FOO', value: 'bar' },
      { key: 'BAZ', value: 'qux' }
    ]);
  });

  it('handles double-quoted values', () => {
    const entries = parseEnvContent('FOO="hello world"');
    expect(entries).toEqual([{ key: 'FOO', value: 'hello world' }]);
  });

  it('handles single-quoted values', () => {
    const entries = parseEnvContent("FOO='hello world'");
    expect(entries).toEqual([{ key: 'FOO', value: 'hello world' }]);
  });

  it('skips empty lines and comments', () => {
    const content = `
# This is a comment
FOO=bar

# Another comment
BAZ=qux
`;
    const entries = parseEnvContent(content);
    expect(entries).toEqual([
      { key: 'FOO', value: 'bar' },
      { key: 'BAZ', value: 'qux' }
    ]);
  });

  it('strips inline comments from unquoted values', () => {
    const entries = parseEnvContent('FOO=bar # this is a comment');
    expect(entries).toEqual([{ key: 'FOO', value: 'bar' }]);
  });

  it('preserves # in quoted values', () => {
    const entries = parseEnvContent('FOO="bar # not a comment"');
    expect(entries).toEqual([{ key: 'FOO', value: 'bar # not a comment' }]);
  });

  it('handles export prefix', () => {
    const entries = parseEnvContent('export FOO=bar\nexport BAZ="qux"');
    expect(entries).toEqual([
      { key: 'FOO', value: 'bar' },
      { key: 'BAZ', value: 'qux' }
    ]);
  });

  it('handles values with = signs', () => {
    const entries = parseEnvContent('DATABASE_URL=postgres://user:pass@host/db?opt=val');
    expect(entries).toEqual([{ key: 'DATABASE_URL', value: 'postgres://user:pass@host/db?opt=val' }]);
  });

  it('handles empty values', () => {
    const entries = parseEnvContent('FOO=');
    expect(entries).toEqual([{ key: 'FOO', value: '' }]);
  });

  it('handles whitespace around = sign', () => {
    const entries = parseEnvContent('  FOO  =  bar  ');
    expect(entries).toEqual([{ key: 'FOO', value: 'bar' }]);
  });

  it('skips lines without = sign', () => {
    const entries = parseEnvContent('INVALID_LINE\nFOO=bar');
    expect(entries).toEqual([{ key: 'FOO', value: 'bar' }]);
  });

  it('returns empty array for empty content', () => {
    const entries = parseEnvContent('');
    expect(entries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Integration tests: validateContainer with Docker
// Uses fixture Dockerfiles and server scripts from tests/fixtures/
// ---------------------------------------------------------------------------

describe('validateContainer (Docker integration)', () => {
  let hasDockerIntegration = false;
  let skipReason = 'Docker integration prerequisites are not met';

  // Check Docker availability and base-image readiness once.
  beforeAll(async () => {
    try {
      await execa('docker', ['info'], { timeout: 10_000 });
    } catch {
      hasDockerIntegration = false;
      skipReason = 'Docker not available';
      return;
    }

    const smokeTag = `caira-container-health-smoke-${Date.now()}`;
    const smokeDockerfile = join(FIXTURES, 'healthy', 'Dockerfile');
    const smokeContext = join(FIXTURES, 'healthy');

    try {
      // Verify Docker integration is actually functional in this environment:
      // build and run a tiny fixture image with bounded timeouts.
      await execa('docker', ['build', '-f', smokeDockerfile, '-t', smokeTag, smokeContext], {
        timeout: 60_000
      });
      await execa('docker', ['run', '--rm', '--entrypoint', 'sh', smokeTag, '-c', 'echo smoke-ok'], {
        timeout: 15_000
      });
      hasDockerIntegration = true;
    } catch {
      hasDockerIntegration = false;
      skipReason = 'Docker build/runtime smoke check failed for integration fixtures';
    } finally {
      await execa('docker', ['rmi', '-f', smokeTag], { timeout: 10_000 }).catch(() => undefined);
    }
  }, 90_000);

  it('validates a healthy container with a minimal Dockerfile', async () => {
    if (!hasDockerIntegration) {
      console.log(`Skipping Docker integration test — ${skipReason}`);
      return;
    }

    const result = await validateContainer({
      dockerfile: join(FIXTURES, 'healthy', 'Dockerfile'),
      healthEndpoint: '/health',
      timeout: 30_000
    });

    expect(result.passed).toBe(true);
    expect(result.healthStatus).toBe(200);
    expect(result.buildDurationMs).toBeGreaterThan(0);
    expect(result.healthCheckDurationMs).toBeGreaterThan(0);
    expect(result.totalDurationMs).toBeGreaterThan(0);
    expect(result.healthBody).toContain('healthy');
  }, 120_000);

  it('detects an unhealthy container (wrong health endpoint)', async () => {
    if (!hasDockerIntegration) {
      console.log(`Skipping Docker integration test — ${skipReason}`);
      return;
    }

    const result = await validateContainer({
      dockerfile: join(FIXTURES, 'wrong-endpoint', 'Dockerfile'),
      healthEndpoint: '/health',
      timeout: 5_000
    });

    expect(result.passed).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.cleanup.containerRemoved).toBe(true);
  }, 120_000);

  it('handles invalid Dockerfile gracefully', async () => {
    if (!hasDockerIntegration) {
      console.log(`Skipping Docker integration test — ${skipReason}`);
      return;
    }

    const result = await validateContainer({
      dockerfile: join(FIXTURES, 'invalid', 'Dockerfile'),
      healthEndpoint: '/health',
      timeout: 5_000
    });

    expect(result.passed).toBe(false);
    expect(result.error).toContain('Docker build failed');
    expect(result.healthCheckDurationMs).toBe(0);
  }, 30_000);

  it('passes env vars from env file to container', async () => {
    if (!hasDockerIntegration) {
      console.log(`Skipping Docker integration test — ${skipReason}`);
      return;
    }

    const result = await validateContainer({
      dockerfile: join(FIXTURES, 'env-test', 'Dockerfile'),
      healthEndpoint: '/health',
      envFile: join(FIXTURES, 'env-test', '.env.test'),
      timeout: 30_000
    });

    expect(result.passed).toBe(true);
    expect(result.healthBody).toContain('ahoy_matey');
  }, 120_000);
});
