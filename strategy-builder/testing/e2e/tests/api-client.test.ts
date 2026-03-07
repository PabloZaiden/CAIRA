/**
 * Unit tests for the API client.
 *
 * Uses a real Fastify server that mimics the backend API v2.0.0 to test
 * the client's request construction and response parsing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { ApiClient } from '../src/helpers/api-client.ts';
import type { AdventureMode, AdventureStarted } from '../src/helpers/api-client.ts';
import { SCHEMAS } from '../src/fixtures/pirate-fixtures.ts';
import { validateSchema } from '../src/helpers/schema-validator.ts';

// ─── Mock backend server ────────────────────────────────────────────────

function createMockBackend() {
  const app = Fastify();

  // In-memory store
  interface StoredAdventure {
    id: string;
    mode: AdventureMode;
    status: 'active' | 'resolved';
    outcome?: { tool: string; result: Record<string, unknown> } | undefined;
    createdAt: string;
    lastParleyAt: string;
    messageCount: number;
    parleys: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
      usage?: { promptTokens: number; completionTokens: number } | undefined;
    }>;
  }

  const adventures: StoredAdventure[] = [];

  let idCounter = 0;
  function nextId(): string {
    idCounter++;
    return `adv_${String(idCounter).padStart(6, '0')}`;
  }

  function msgId(): string {
    idCounter++;
    return `msg_${String(idCounter).padStart(6, '0')}`;
  }

  // Health
  app.get('/health', async () => ({
    status: 'healthy',
    dependencies: [{ name: 'agent-container', status: 'healthy', latencyMs: 12 }]
  }));

  // Start shanty
  app.post('/api/pirate/shanty', async (_req, reply) => {
    return startAdventure('shanty', reply);
  });

  // Start treasure
  app.post('/api/pirate/treasure', async (_req, reply) => {
    return startAdventure('treasure', reply);
  });

  // Enlist in crew
  app.post('/api/pirate/crew/enlist', async (_req, reply) => {
    return startAdventure('crew', reply);
  });

  // Synthetic messages (matches the real API's SYNTHETIC_MESSAGES)
  const syntheticMessages: Record<string, string> = {
    shanty: 'Sing me a sea shanty and challenge me to a verse duel! Let us trade shanty verses back and forth.',
    treasure: 'I seek buried treasure! Guide me on a treasure hunting adventure with choices and discoveries.',
    crew: 'I want to join your pirate crew! Interview me and assign me a rank and role aboard your ship.'
  };

  function startAdventure(
    mode: AdventureMode,
    reply: { status: (code: number) => { send: (body: unknown) => unknown } }
  ) {
    const now = new Date().toISOString();
    const id = nextId();
    const adv: StoredAdventure = {
      id,
      mode,
      status: 'active',
      createdAt: now,
      lastParleyAt: now,
      messageCount: 0,
      parleys: []
    };
    adventures.push(adv);
    return reply.status(201).send({
      id: adv.id,
      mode: adv.mode,
      status: adv.status,
      syntheticMessage: syntheticMessages[mode] ?? '',
      createdAt: adv.createdAt
    } satisfies AdventureStarted);
  }

  // List adventures
  app.get('/api/pirate/adventures', async (req) => {
    const query = req.query as { offset?: string; limit?: string };
    const offset = Number(query.offset ?? 0);
    const limit = Number(query.limit ?? 20);
    const page = adventures.slice(offset, offset + limit);
    return {
      adventures: page.map((a) => ({
        id: a.id,
        mode: a.mode,
        status: a.status,
        outcome: a.outcome,
        createdAt: a.createdAt,
        lastParleyAt: a.lastParleyAt,
        messageCount: a.messageCount
      })),
      offset,
      limit,
      total: adventures.length
    };
  });

  // Get adventure detail
  app.get<{ Params: { adventureId: string } }>('/api/pirate/adventures/:adventureId', async (req, reply) => {
    const adv = adventures.find((a) => a.id === req.params.adventureId);
    if (!adv) {
      return reply.status(404).send({ code: 'not_found', message: 'Adventure not found' });
    }
    return {
      id: adv.id,
      mode: adv.mode,
      status: adv.status,
      outcome: adv.outcome,
      createdAt: adv.createdAt,
      lastParleyAt: adv.lastParleyAt,
      messageCount: adv.messageCount,
      parleys: adv.parleys
    };
  });

  // Parley (JSON + SSE)
  app.post<{ Params: { adventureId: string } }>('/api/pirate/adventures/:adventureId/parley', async (req, reply) => {
    const adv = adventures.find((a) => a.id === req.params.adventureId);
    if (!adv) {
      return reply.status(404).send({ code: 'not_found', message: 'Adventure not found' });
    }

    const body = req.body as { message: string };
    if (!body.message) {
      return reply.status(400).send({ code: 'bad_request', message: 'Message is required' });
    }

    const accept = req.headers.accept ?? 'application/json';
    const now = new Date().toISOString();

    // Add user message
    const userMsg = {
      id: msgId(),
      role: 'user' as const,
      content: body.message,
      createdAt: now
    };
    adv.parleys.push(userMsg);

    // Generate pirate response
    const assistantMsg = {
      id: msgId(),
      role: 'assistant' as const,
      content: 'Arr, that be a fine question, matey!',
      createdAt: now,
      usage: { promptTokens: 10, completionTokens: 8 }
    };
    adv.parleys.push(assistantMsg);
    adv.messageCount = adv.parleys.length;
    adv.lastParleyAt = now;

    if (accept.includes('text/event-stream')) {
      // SSE streaming
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });

      reply.hijack();

      const chunks = ['Arr, ', 'that be ', 'a fine question, ', 'matey!'];
      for (const chunk of chunks) {
        reply.raw.write(`event: message.delta\ndata: ${JSON.stringify({ content: chunk })}\n\n`);
      }

      reply.raw.write(
        `event: message.complete\ndata: ${JSON.stringify({
          messageId: assistantMsg.id,
          content: assistantMsg.content,
          usage: assistantMsg.usage
        })}\n\n`
      );

      reply.raw.write('data: [DONE]\n\n');
      reply.raw.end();
      return;
    }

    // JSON response
    return reply.send(assistantMsg);
  });

  // Stats
  app.get('/api/pirate/stats', async () => {
    const byMode = (mode: AdventureMode) => {
      const matching = adventures.filter((a) => a.mode === mode);
      return {
        total: matching.length,
        active: matching.filter((a) => a.status === 'active').length,
        resolved: matching.filter((a) => a.status === 'resolved').length
      };
    };
    return {
      totalAdventures: adventures.length,
      activeAdventures: adventures.filter((a) => a.status === 'active').length,
      resolvedAdventures: adventures.filter((a) => a.status === 'resolved').length,
      byMode: {
        shanty: byMode('shanty'),
        treasure: byMode('treasure'),
        crew: byMode('crew')
      }
    };
  });

  return app;
}

// ─── Tests ──────────────────────────────────────────────────────────────

describe('ApiClient', () => {
  const app = createMockBackend();
  let client: ApiClient;

  beforeAll(async () => {
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    const port = Number(new URL(address).port);
    client = new ApiClient({ baseUrl: `http://127.0.0.1:${port}` });
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Health ─────────────────────────────────────────────────────────

  describe('getHealth', () => {
    it('returns healthy status', async () => {
      const res = await client.getHealth();
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('healthy');
    });

    it('response matches HealthResponse schema', async () => {
      const res = await client.getHealth();
      const validation = await validateSchema(SCHEMAS.HealthResponse, res.body);
      expect(validation.valid).toBe(true);
    });
  });

  // ─── Business Operations ────────────────────────────────────────────

  describe('startShanty', () => {
    it('creates a shanty adventure with 201', async () => {
      const res = await client.startShanty();
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.mode).toBe('shanty');
      expect(res.body.status).toBe('active');
      expect(res.body.syntheticMessage).toBeDefined();
      expect(res.body.syntheticMessage).toBeTruthy();
      expect(res.body.createdAt).toBeDefined();
    });

    it('response matches AdventureStarted schema', async () => {
      const res = await client.startShanty();
      const validation = await validateSchema(SCHEMAS.AdventureStarted, res.body);
      expect(validation.valid).toBe(true);
    });
  });

  describe('seekTreasure', () => {
    it('creates a treasure adventure with 201', async () => {
      const res = await client.seekTreasure();
      expect(res.status).toBe(201);
      expect(res.body.mode).toBe('treasure');
      expect(res.body.status).toBe('active');
    });
  });

  describe('enlistInCrew', () => {
    it('creates a crew adventure with 201', async () => {
      const res = await client.enlistInCrew();
      expect(res.status).toBe(201);
      expect(res.body.mode).toBe('crew');
      expect(res.body.status).toBe('active');
    });
  });

  // ─── List adventures ───────────────────────────────────────────────

  describe('listAdventures', () => {
    it('returns a paginated list', async () => {
      const res = await client.listAdventures();
      expect(res.status).toBe(200);
      expect(res.body.adventures).toBeInstanceOf(Array);
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.offset).toBe(0);
      expect(res.body.limit).toBe(20);
    });

    it('response matches AdventureList schema', async () => {
      const res = await client.listAdventures();
      const validation = await validateSchema(SCHEMAS.AdventureList, res.body);
      expect(validation.valid).toBe(true);
    });

    it('supports pagination parameters', async () => {
      const res = await client.listAdventures({ offset: 0, limit: 1 });
      expect(res.status).toBe(200);
      expect(res.body.adventures.length).toBeLessThanOrEqual(1);
      expect(res.body.limit).toBe(1);
    });
  });

  // ─── Parley (JSON) ─────────────────────────────────────────────────

  describe('parley', () => {
    let adventureId: string;

    beforeAll(async () => {
      const res = await client.startShanty();
      adventureId = res.body.id;
    });

    it('sends a message and gets a pirate response', async () => {
      const res = await client.parley(adventureId, 'Ahoy!');
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('assistant');
      expect(res.body.content).toBeTruthy();
    });

    it('response matches ParleyMessage schema', async () => {
      const res = await client.parley(adventureId, 'Tell me about treasure!');
      const validation = await validateSchema(SCHEMAS.ParleyMessage, res.body);
      expect(validation.valid).toBe(true);
    });

    it('returns 404 for non-existent adventure', async () => {
      const res = await client.parley('nonexistent_adventure_000', 'Hello?');
      expect(res.status).toBe(404);
    });
  });

  // ─── Get adventure detail ──────────────────────────────────────────

  describe('getAdventure', () => {
    let adventureId: string;

    beforeAll(async () => {
      const res = await client.startShanty();
      adventureId = res.body.id;
      // Send a message so there are parleys
      await client.parley(adventureId, 'Ahoy!');
    });

    it('returns adventure with parleys', async () => {
      const res = await client.getAdventure(adventureId);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(adventureId);
      expect(res.body.mode).toBe('shanty');
      expect(res.body.parleys).toBeInstanceOf(Array);
      expect(res.body.parleys.length).toBeGreaterThan(0);
    });

    it('response matches AdventureDetail schema', async () => {
      const res = await client.getAdventure(adventureId);
      const validation = await validateSchema(SCHEMAS.AdventureDetail, res.body);
      expect(validation.valid).toBe(true);
    });

    it('returns 404 for non-existent adventure', async () => {
      const res = await client.getAdventure('nonexistent_adventure_000');
      expect(res.status).toBe(404);
    });
  });

  // ─── Stats ──────────────────────────────────────────────────────────

  describe('getStats', () => {
    it('returns statistics', async () => {
      const res = await client.getStats();
      expect(res.status).toBe(200);
      expect(res.body.totalAdventures).toBeGreaterThan(0);
      expect(typeof res.body.activeAdventures).toBe('number');
      expect(typeof res.body.resolvedAdventures).toBe('number');
      expect(res.body.byMode).toBeDefined();
      expect(res.body.byMode.shanty).toBeDefined();
      expect(res.body.byMode.treasure).toBeDefined();
      expect(res.body.byMode.crew).toBeDefined();
    });

    it('response matches ActivityStats schema', async () => {
      const res = await client.getStats();
      const validation = await validateSchema(SCHEMAS.ActivityStats, res.body);
      expect(validation.valid).toBe(true);
    });
  });
});
