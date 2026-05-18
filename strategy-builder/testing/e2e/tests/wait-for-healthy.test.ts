/**
 * Unit tests for the wait-for-healthy helper.
 *
 * Uses a real Fastify server to test polling behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { waitForHealthy } from '../src/helpers/wait-for-healthy.ts';

describe('waitForHealthy', () => {
  // ─── Immediate success ──────────────────────────────────────────────

  describe('with a healthy server', () => {
    const app = Fastify();
    let port: number;

    beforeAll(async () => {
      app.get('/health', async () => ({ status: 'healthy' }));
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      port = Number(new URL(address).port);
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns healthy on first attempt', async () => {
      const result = await waitForHealthy({
        url: `http://127.0.0.1:${port}`,
        timeoutMs: 5_000
      });

      expect(result.healthy).toBe(true);
      expect(result.attempts).toBe(1);
      expect(result.elapsedMs).toBeLessThan(5_000);
      expect(result.lastError).toBeUndefined();
    });

    it('works with custom health path', async () => {
      // /health returns 200, so this should succeed
      const result = await waitForHealthy({
        url: `http://127.0.0.1:${port}`,
        path: '/health',
        timeoutMs: 5_000
      });

      expect(result.healthy).toBe(true);
    });
  });

  // ─── Delayed health ─────────────────────────────────────────────────

  describe('with delayed health', () => {
    const app = Fastify();
    let port: number;
    let requestCount = 0;

    beforeAll(async () => {
      app.get('/health', async (_req, reply) => {
        requestCount++;
        if (requestCount < 3) {
          return reply.status(503).send({ status: 'unhealthy' });
        }
        return { status: 'healthy' };
      });
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      port = Number(new URL(address).port);
    });

    afterAll(async () => {
      await app.close();
    });

    it('retries and eventually succeeds', async () => {
      requestCount = 0;
      const result = await waitForHealthy({
        url: `http://127.0.0.1:${port}`,
        timeoutMs: 10_000,
        initialDelayMs: 50
      });

      expect(result.healthy).toBe(true);
      expect(result.attempts).toBeGreaterThanOrEqual(3);
    });
  });

  // ─── Timeout ────────────────────────────────────────────────────────

  describe('timeout', () => {
    const app = Fastify();
    let port: number;

    beforeAll(async () => {
      app.get('/health', async (_req, reply) => {
        return reply.status(503).send({ status: 'unhealthy' });
      });
      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      port = Number(new URL(address).port);
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns unhealthy after timeout', async () => {
      const result = await waitForHealthy({
        url: `http://127.0.0.1:${port}`,
        timeoutMs: 500,
        initialDelayMs: 50
      });

      expect(result.healthy).toBe(false);
      expect(result.attempts).toBeGreaterThan(0);
      expect(result.lastError).toBe('HTTP 503');
    });
  });

  // ─── Connection refused ─────────────────────────────────────────────

  describe('connection refused', () => {
    it('returns unhealthy with error message', async () => {
      const result = await waitForHealthy({
        url: 'http://127.0.0.1:19999',
        timeoutMs: 500,
        initialDelayMs: 50
      });

      expect(result.healthy).toBe(false);
      expect(result.lastError).toBeDefined();
    });
  });

  // ─── Abort signal ───────────────────────────────────────────────────

  describe('abort signal', () => {
    it('returns unhealthy when aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      const result = await waitForHealthy({
        url: 'http://127.0.0.1:19999',
        timeoutMs: 5_000,
        signal: controller.signal
      });

      expect(result.healthy).toBe(false);
      expect(result.lastError).toBe('Aborted');
    });
  });
});
