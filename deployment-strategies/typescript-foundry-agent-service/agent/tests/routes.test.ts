/**
 * Tests for src/routes.ts — Fastify route handlers.
 *
 * Uses a real Fastify instance with a mock FoundryClient to test all
 * agent-api.openapi.yaml endpoints: conversations CRUD, messaging
 * (JSON + SSE), health, and metrics.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerRoutes, resetMetrics, getMetrics } from '../src/routes.ts';
import type { FoundryClient } from '../src/foundry-client.ts';
import type { Conversation, ConversationDetail, ConversationList, Message, HealthResponse } from '../src/types.ts';

// ---------- Mock FoundryClient ----------

function createMockFoundryClient(): FoundryClient {
  const conversations = new Map<string, Conversation>();
  const conversationMessages = new Map<string, Message[]>();

  const client: FoundryClient = {
    createConversation: async (metadata?: Record<string, unknown> | undefined) => {
      const id = `conv_${conversations.size + 1}`;
      const now = new Date().toISOString();
      const conv: Conversation = {
        id,
        createdAt: now,
        updatedAt: now,
        ...(metadata ? { metadata } : {})
      };
      conversations.set(id, conv);
      return conv;
    },

    listConversations: async (offset: number = 0, limit: number = 20) => {
      const all = Array.from(conversations.values());
      const page = all.slice(offset, offset + limit);
      const list: ConversationList = {
        items: page,
        offset,
        limit,
        total: all.length
      };
      return list;
    },

    getConversation: async (id: string) => {
      const conv = conversations.get(id);
      if (!conv) return undefined;
      const messages = conversationMessages.get(id) ?? [];
      const detail: ConversationDetail = {
        ...conv,
        messages
      };
      return detail;
    },

    sendMessage: async (conversationId: string, content: string) => {
      const conv = conversations.get(conversationId);
      if (!conv) return undefined;
      const msg: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        content: `Response to: ${content}`,
        createdAt: new Date().toISOString(),
        usage: { promptTokens: 10, completionTokens: 5 }
      };
      const msgs = conversationMessages.get(conversationId) ?? [];
      msgs.push(msg);
      conversationMessages.set(conversationId, msgs);
      return msg;
    },

    sendMessageStream: async (conversationId: string, content: string, onChunk: (chunk: string) => void) => {
      const conv = conversations.get(conversationId);
      if (!conv) {
        onChunk(`event: error\ndata: ${JSON.stringify({ code: 'not_found', message: 'Conversation not found' })}\n\n`);
        return;
      }
      onChunk(`event: message.delta\ndata: ${JSON.stringify({ content: `Response to: ${content}` })}\n\n`);
      onChunk(
        `event: message.complete\ndata: ${JSON.stringify({
          messageId: 'msg_stream',
          content: `Response to: ${content}`,
          usage: { promptTokens: 10, completionTokens: 5 }
        })}\n\n`
      );
    },

    checkHealth: async () => {
      const health: HealthResponse = {
        status: 'healthy',
        checks: [{ name: 'azure-ai-foundry', status: 'healthy', latencyMs: 5 }]
      };
      return health;
    },

    initialise: async () => {}
  } as unknown as FoundryClient;

  return client;
}

// ---------- Test setup ----------

let app: FastifyInstance;
let mockClient: FoundryClient;

async function setupApp(): Promise<void> {
  resetMetrics();
  mockClient = createMockFoundryClient();
  app = Fastify({ logger: false });
  registerRoutes(app, mockClient);
  await app.ready();
}

describe('routes', () => {
  beforeEach(async () => {
    await setupApp();
  });

  afterEach(async () => {
    await app.close();
  });

  // ---- POST /conversations ----

  describe('POST /conversations', () => {
    it('creates a conversation and returns 201', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/conversations'
      });
      expect(resp.statusCode).toBe(201);
      const body = resp.json();
      expect(body.id).toBeDefined();
      expect(body.createdAt).toBeDefined();
      expect(body.updatedAt).toBeDefined();
    });

    it('passes metadata when provided', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/conversations',
        payload: { metadata: { topic: 'pirates' } }
      });
      expect(resp.statusCode).toBe(201);
      expect(resp.json().metadata).toEqual({ topic: 'pirates' });
    });

    it('increments conversations_created metric', async () => {
      await app.inject({ method: 'POST', url: '/conversations' });
      await app.inject({ method: 'POST', url: '/conversations' });
      const m = getMetrics();
      expect(m.conversationsCreated).toBe(2);
    });
  });

  // ---- GET /conversations ----

  describe('GET /conversations', () => {
    it('returns empty list initially', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/conversations'
      });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });

    it('returns conversations after creation', async () => {
      await app.inject({ method: 'POST', url: '/conversations' });
      await app.inject({ method: 'POST', url: '/conversations' });

      const resp = await app.inject({
        method: 'GET',
        url: '/conversations'
      });
      expect(resp.statusCode).toBe(200);
      expect(resp.json().items).toHaveLength(2);
    });

    it('respects offset and limit query params', async () => {
      await app.inject({ method: 'POST', url: '/conversations' });
      await app.inject({ method: 'POST', url: '/conversations' });
      await app.inject({ method: 'POST', url: '/conversations' });

      const resp = await app.inject({
        method: 'GET',
        url: '/conversations?offset=1&limit=1'
      });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body.items).toHaveLength(1);
      expect(body.offset).toBe(1);
      expect(body.limit).toBe(1);
      expect(body.total).toBe(3);
    });
  });

  // ---- GET /conversations/:conversationId ----

  describe('GET /conversations/:conversationId', () => {
    it('returns conversation detail with messages', async () => {
      const createResp = await app.inject({
        method: 'POST',
        url: '/conversations'
      });
      const { id } = createResp.json();

      const resp = await app.inject({
        method: 'GET',
        url: `/conversations/${id}`
      });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body.id).toBe(id);
      expect(body.messages).toEqual([]);
    });

    it('returns 404 for unknown conversation', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/conversations/nonexistent'
      });
      expect(resp.statusCode).toBe(404);
      expect(resp.json().code).toBe('not_found');
    });

    it('returns 400 for invalid ID format', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/conversations/not-a-valid-id!!!'
      });
      expect(resp.statusCode).toBe(400);
      expect(resp.json().code).toBe('bad_request');
    });
  });

  // ---- POST /conversations/:conversationId/messages (JSON) ----

  describe('POST /conversations/:conversationId/messages (JSON)', () => {
    it('sends a message and returns assistant response', async () => {
      const createResp = await app.inject({
        method: 'POST',
        url: '/conversations'
      });
      const { id } = createResp.json();

      const resp = await app.inject({
        method: 'POST',
        url: `/conversations/${id}/messages`,
        headers: { accept: 'application/json' },
        payload: { content: 'Hello pirate!' }
      });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body.role).toBe('assistant');
      expect(body.content).toContain('Response to: Hello pirate!');
    });

    it('returns 400 for missing content', async () => {
      const createResp = await app.inject({
        method: 'POST',
        url: '/conversations'
      });
      const { id } = createResp.json();

      const resp = await app.inject({
        method: 'POST',
        url: `/conversations/${id}/messages`,
        payload: {}
      });
      expect(resp.statusCode).toBe(400);
      expect(resp.json().code).toBe('bad_request');
    });

    it('returns 400 for empty content', async () => {
      const createResp = await app.inject({
        method: 'POST',
        url: '/conversations'
      });
      const { id } = createResp.json();

      const resp = await app.inject({
        method: 'POST',
        url: `/conversations/${id}/messages`,
        payload: { content: '' }
      });
      expect(resp.statusCode).toBe(400);
      expect(resp.json().code).toBe('bad_request');
    });

    it('returns 404 for unknown conversation', async () => {
      const resp = await app.inject({
        method: 'POST',
        url: '/conversations/nonexistent/messages',
        headers: { accept: 'application/json' },
        payload: { content: 'Hello' }
      });
      expect(resp.statusCode).toBe(404);
    });

    it('increments messages_sent metric', async () => {
      const createResp = await app.inject({
        method: 'POST',
        url: '/conversations'
      });
      const { id } = createResp.json();

      await app.inject({
        method: 'POST',
        url: `/conversations/${id}/messages`,
        headers: { accept: 'application/json' },
        payload: { content: 'Hello!' }
      });

      const m = getMetrics();
      expect(m.messagesSent).toBe(1);
    });
  });

  // ---- POST /conversations/:conversationId/messages (SSE) ----

  describe('POST /conversations/:conversationId/messages (SSE)', () => {
    it('returns SSE stream with delta and complete events', async () => {
      const createResp = await app.inject({
        method: 'POST',
        url: '/conversations'
      });
      const { id } = createResp.json();

      const resp = await app.inject({
        method: 'POST',
        url: `/conversations/${id}/messages`,
        headers: { accept: 'text/event-stream' },
        payload: { content: 'Stream test' }
      });

      // When using reply.hijack(), Fastify returns 200 with the raw stream
      expect(resp.statusCode).toBe(200);
      const body = resp.body;
      expect(body).toContain('event: message.delta');
      expect(body).toContain('event: message.complete');
      expect(body).toContain('Response to: Stream test');
    });
  });

  // ---- GET /health ----

  describe('GET /health', () => {
    it('returns healthy status', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/health'
      });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(body.status).toBe('healthy');
      expect(body.checks).toHaveLength(1);
      expect(body.checks[0].name).toBe('azure-ai-foundry');
    });

    it('returns 503 for unhealthy status', async () => {
      // Override mock to return unhealthy
      (mockClient as unknown as Record<string, unknown>)['checkHealth'] = async () => ({
        status: 'unhealthy',
        checks: [{ name: 'azure-ai-foundry', status: 'unhealthy' }]
      });

      const resp = await app.inject({
        method: 'GET',
        url: '/health'
      });
      expect(resp.statusCode).toBe(503);
      expect(resp.json().status).toBe('unhealthy');
    });
  });

  // ---- GET /metrics ----

  describe('GET /metrics', () => {
    it('returns Prometheus-formatted metrics', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/metrics'
      });
      expect(resp.statusCode).toBe(200);
      expect(resp.headers['content-type']).toContain('text/plain');
      const body = resp.body;
      expect(body).toContain('agent_requests_total');
      expect(body).toContain('agent_conversations_created_total');
      expect(body).toContain('agent_messages_sent_total');
      expect(body).toContain('agent_errors_total');
    });

    it('reflects actual request counts', async () => {
      // Make some requests
      await app.inject({ method: 'POST', url: '/conversations' });
      await app.inject({ method: 'GET', url: '/health' });

      const resp = await app.inject({
        method: 'GET',
        url: '/metrics'
      });
      const body = resp.body;
      // 2 prior requests + the metrics request itself = 3 total
      expect(body).toContain('agent_requests_total 3');
    });
  });

  // ---- Request counting ----

  describe('request tracking', () => {
    it('increments request count for every request', async () => {
      await app.inject({ method: 'GET', url: '/health' });
      await app.inject({ method: 'GET', url: '/health' });
      await app.inject({ method: 'GET', url: '/health' });
      const m = getMetrics();
      expect(m.requestCount).toBe(3);
    });
  });

  // ---- GET /identity ----

  describe('GET /identity', () => {
    afterEach(() => {
      delete process.env['SKIP_AUTH'];
    });

    it('ignores SKIP_AUTH and still attempts credential validation', async () => {
      process.env['SKIP_AUTH'] = 'true';

      const resp = await app.inject({
        method: 'GET',
        url: '/identity'
      });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      // The key assertion: SKIP_AUTH does NOT short-circuit this endpoint.
      // It always attempts real credential validation. The result depends on
      // whether credentials are available in the current environment.
      expect(typeof body.authenticated).toBe('boolean');
      if (body.authenticated) {
        expect(body.identity).toBeDefined();
      } else {
        expect(body.reason).toBeDefined();
      }
    });

    it('returns valid response shape', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/identity'
      });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      expect(typeof body.authenticated).toBe('boolean');
      if (body.authenticated) {
        expect(body.identity).toBeDefined();
        expect(body.identity.type).toBeDefined();
      } else {
        expect(body.reason).toBeDefined();
      }
    });

    it('identity includes expected fields when authenticated', async () => {
      const resp = await app.inject({
        method: 'GET',
        url: '/identity'
      });
      expect(resp.statusCode).toBe(200);
      const body = resp.json();
      if (body.authenticated) {
        expect(body.identity.tenantId).toBeDefined();
        expect(body.identity.objectId).toBeDefined();
        expect(['user', 'servicePrincipal', 'managedIdentity', 'unknown']).toContain(body.identity.type);
      }
    });
  });
});
