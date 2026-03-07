/**
 * Unit tests for the SSE collector.
 *
 * Uses a real Fastify server that streams SSE events to test
 * event parsing, done markers, and timeout handling.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { collectSSEEvents } from '../src/helpers/sse-collector.ts';

describe('collectSSEEvents', () => {
  // ─── Standard SSE stream ────────────────────────────────────────────

  describe('standard stream', () => {
    const app = Fastify();
    let port: number;

    beforeAll(async () => {
      app.get('/stream', async (_req, reply) => {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        reply.hijack();

        reply.raw.write('event: message.delta\ndata: {"content": "Hello "}\n\n');
        reply.raw.write('event: message.delta\ndata: {"content": "world!"}\n\n');
        reply.raw.write(
          'event: message.complete\ndata: {"messageId": "msg_1", "content": "Hello world!", "usage": {"promptTokens": 5, "completionTokens": 2}}\n\n'
        );
        reply.raw.write('data: [DONE]\n\n');
        reply.raw.end();
      });

      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      port = Number(new URL(address).port);
    });

    afterAll(async () => {
      await app.close();
    });

    it('collects all events', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/stream`);
      const result = await collectSSEEvents(response);

      expect(result.done).toBe(true);
      expect(result.events.length).toBe(3); // 2 deltas + 1 complete
      expect(result.error).toBeUndefined();
    });

    it('parses event types correctly', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/stream`);
      const result = await collectSSEEvents(response);

      expect(result.events[0]?.event).toBe('message.delta');
      expect(result.events[1]?.event).toBe('message.delta');
      expect(result.events[2]?.event).toBe('message.complete');
    });

    it('parses JSON data correctly', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/stream`);
      const result = await collectSSEEvents(response);

      const delta = result.events[0]?.data as { content: string };
      expect(delta.content).toBe('Hello ');

      const complete = result.events[2]?.data as { messageId: string; content: string };
      expect(complete.messageId).toBe('msg_1');
      expect(complete.content).toBe('Hello world!');
    });

    it('preserves raw data strings', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/stream`);
      const result = await collectSSEEvents(response);

      expect(result.events[0]?.rawData).toBe('{"content": "Hello "}');
    });

    it('filters out [DONE] marker from events', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/stream`);
      const result = await collectSSEEvents(response);

      // [DONE] should not appear in the events array
      const doneEvents = result.events.filter((e) => e.rawData === '[DONE]');
      expect(doneEvents.length).toBe(0);
    });
  });

  // ─── Empty stream ──────────────────────────────────────────────────

  describe('empty stream', () => {
    const app = Fastify();
    let port: number;

    beforeAll(async () => {
      app.get('/empty', async (_req, reply) => {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        });
        reply.hijack();
        reply.raw.end();
      });

      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      port = Number(new URL(address).port);
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns empty events array', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/empty`);
      const result = await collectSSEEvents(response);

      expect(result.events.length).toBe(0);
      expect(result.done).toBe(true);
    });
  });

  // ─── Done event type ───────────────────────────────────────────────

  describe('done event type', () => {
    const app = Fastify();
    let port: number;

    beforeAll(async () => {
      app.get('/done-event', async (_req, reply) => {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        });
        reply.hijack();

        reply.raw.write('event: message.delta\ndata: {"content": "test"}\n\n');
        reply.raw.write('event: done\ndata: {}\n\n');
        reply.raw.end();
      });

      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      port = Number(new URL(address).port);
    });

    afterAll(async () => {
      await app.close();
    });

    it('treats event: done as done marker', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/done-event`);
      const result = await collectSSEEvents(response);

      expect(result.done).toBe(true);
      expect(result.events.length).toBe(1); // Only the delta, not the done event
    });
  });

  // ─── Non-JSON data ─────────────────────────────────────────────────

  describe('non-JSON data', () => {
    const app = Fastify();
    let port: number;

    beforeAll(async () => {
      app.get('/text-data', async (_req, reply) => {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        });
        reply.hijack();

        reply.raw.write('event: info\ndata: Just a plain string\n\n');
        reply.raw.end();
      });

      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      port = Number(new URL(address).port);
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns raw string for non-JSON data', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/text-data`);
      const result = await collectSSEEvents(response);

      expect(result.events.length).toBe(1);
      expect(result.events[0]?.data).toBe('Just a plain string');
      expect(result.events[0]?.rawData).toBe('Just a plain string');
    });
  });

  // ─── Timeout ───────────────────────────────────────────────────────

  describe('timeout', () => {
    const app = Fastify();
    let port: number;

    beforeAll(async () => {
      app.get('/slow', async (_req, reply) => {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache'
        });
        reply.hijack();

        reply.raw.write('event: message.delta\ndata: {"content": "start"}\n\n');
        // Don't end the stream — it will timeout
      });

      const address = await app.listen({ port: 0, host: '127.0.0.1' });
      port = Number(new URL(address).port);
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns partial events on timeout', async () => {
      const response = await fetch(`http://127.0.0.1:${port}/slow`);
      const result = await collectSSEEvents(response, { timeoutMs: 500 });

      expect(result.done).toBe(false);
      expect(result.error).toBe('Stream timeout');
      expect(result.events.length).toBe(1);
      expect(result.events[0]?.event).toBe('message.delta');
    });
  });
});
