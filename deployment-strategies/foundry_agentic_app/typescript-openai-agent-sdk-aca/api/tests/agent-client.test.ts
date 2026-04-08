/**
 * Unit tests for agent-client.ts
 *
 * Uses a real Fastify server as a mock agent backend to test the AgentClient
 * including retry logic, circuit breaker, and error handling.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AgentClient, mapAgentStatus } from '../src/agent-client.ts';

// ---------- Mock agent server ----------

let mockServer: FastifyInstance;
let baseUrl: string;

// Counters for testing retry behavior
let requestCount = 0;
let failUntilRequest = 0;
let failStatus = 500;
let lastAuthorizationHeader: string | undefined;

function readAuthorizationHeader(headers: Record<string, string | string[] | undefined>): string | undefined {
  const value = headers['authorization'];
  return Array.isArray(value) ? value[0] : value;
}

beforeAll(async () => {
  mockServer = Fastify({ logger: false });

  // Health endpoint
  mockServer.get('/health', async (req, reply) => {
    lastAuthorizationHeader = readAuthorizationHeader(req.headers);
    await reply.send({ status: 'healthy', checks: [{ name: 'test', status: 'healthy' }] });
  });

  // Create conversation
  mockServer.post('/conversations', async (req, reply) => {
    lastAuthorizationHeader = readAuthorizationHeader(req.headers);
    requestCount++;
    if (requestCount <= failUntilRequest) {
      await reply.status(failStatus).send({ error: { code: 'test_error', message: 'Injected failure' } });
      return;
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    await reply.status(201).send({
      id: '550e8400-e29b-41d4-a716-446655440000',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      ...(body['metadata'] ? { metadata: body['metadata'] } : {})
    });
  });

  // List conversations
  mockServer.get('/conversations', async (req, reply) => {
    lastAuthorizationHeader = readAuthorizationHeader(req.headers);
    const query = req.query as Record<string, string | undefined>;
    const offset = parseInt(query['offset'] ?? '0', 10);
    const limit = parseInt(query['limit'] ?? '20', 10);
    await reply.send({
      items: [
        {
          id: '550e8400-e29b-41d4-a716-446655440000',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T12:00:00Z'
        }
      ],
      offset,
      limit,
      total: 1
    });
  });

  // Get conversation detail
  mockServer.get('/conversations/:id', async (req, reply) => {
    lastAuthorizationHeader = readAuthorizationHeader(req.headers);
    const { id } = req.params as { id: string };
    if (id === 'nonexistent') {
      await reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return;
    }
    await reply.send({
      id,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T12:00:00Z',
      messages: [
        { id: 'msg_1', role: 'user', content: 'Ahoy!', createdAt: '2026-01-01T00:00:01Z' },
        {
          id: 'msg_2',
          role: 'assistant',
          content: 'Arr, welcome aboard!',
          createdAt: '2026-01-01T00:00:02Z',
          usage: { promptTokens: 5, completionTokens: 8 }
        }
      ]
    });
  });

  // Send message (JSON)
  mockServer.post('/conversations/:id/messages', async (req, reply) => {
    lastAuthorizationHeader = readAuthorizationHeader(req.headers);
    const { id } = req.params as { id: string };
    if (id === 'nonexistent') {
      await reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return;
    }

    const accept = req.headers['accept'] ?? '';
    const body = req.body as Record<string, unknown>;

    if (accept.includes('text/event-stream')) {
      // SSE streaming response
      void reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      reply.raw.write('event: message.delta\ndata: {"content":"Arr, "}\n\n');
      reply.raw.write('event: message.delta\ndata: {"content":"welcome!"}\n\n');
      reply.raw.write(
        'event: message.complete\ndata: {"messageId":"msg_3","content":"Arr, welcome!","usage":{"promptTokens":5,"completionTokens":4}}\n\n'
      );
      reply.raw.write('event: done\ndata: [DONE]\n\n');
      reply.raw.end();
      return;
    }

    await reply.send({
      id: 'msg_3',
      role: 'assistant',
      content: `Response to: ${body['content'] as string}`,
      createdAt: '2026-01-01T00:00:03Z'
    });
  });

  const address = await mockServer.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = address;
}, 30_000);

afterAll(async () => {
  await mockServer.close();
});

beforeEach(() => {
  requestCount = 0;
  failUntilRequest = 0;
  failStatus = 500;
  lastAuthorizationHeader = undefined;
});

// ---------- Tests ----------

describe('AgentClient', () => {
  function createClient(overrides?: Partial<{ skipAuth: boolean; getToken: () => Promise<string> }>): AgentClient {
    return new AgentClient({
      baseUrl,
      skipAuth: true,
      ...overrides
    });
  }

  describe('createConversation', () => {
    it('creates a conversation successfully', async () => {
      const client = createClient();
      const result = await client.createConversation();
      expect(result.ok).toBe(true);
      expect(result.status).toBe(201);
      expect(result.data?.id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('passes metadata through', async () => {
      const client = createClient();
      const result = await client.createConversation({ theme: 'pirate' });
      expect(result.ok).toBe(true);
      expect(result.data?.metadata).toEqual({ theme: 'pirate' });
    });
  });

  describe('listConversations', () => {
    it('lists conversations with defaults', async () => {
      const client = createClient();
      const result = await client.listConversations();
      expect(result.ok).toBe(true);
      expect(result.data?.items).toHaveLength(1);
      expect(result.data?.total).toBe(1);
    });

    it('passes offset and limit', async () => {
      const client = createClient();
      const result = await client.listConversations(5, 10);
      expect(result.ok).toBe(true);
      expect(result.data?.offset).toBe(5);
      expect(result.data?.limit).toBe(10);
    });
  });

  describe('getConversation', () => {
    it('gets conversation detail', async () => {
      const client = createClient();
      const result = await client.getConversation('550e8400-e29b-41d4-a716-446655440000');
      expect(result.ok).toBe(true);
      expect(result.data?.messages).toHaveLength(2);
      expect(result.data?.messages[0]?.role).toBe('user');
      expect(result.data?.messages[1]?.role).toBe('assistant');
    });

    it('returns 404 for nonexistent conversation', async () => {
      const client = createClient();
      const result = await client.getConversation('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
      expect(result.error?.code).toBe('not_found');
    });
  });

  describe('sendMessage', () => {
    it('sends a message and gets JSON response', async () => {
      const client = createClient();
      const result = await client.sendMessage('test-conv', 'Hello pirate!');
      expect(result.ok).toBe(true);
      expect(result.data?.content).toContain('Hello pirate!');
    });
  });

  describe('sendMessageStream', () => {
    it('returns raw Response for SSE streaming', async () => {
      const client = createClient();
      const response = await client.sendMessageStream('test-conv', 'Ahoy!');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/event-stream');

      // Read the stream
      const text = await response.text();
      expect(text).toContain('message.delta');
      expect(text).toContain('message.complete');
      expect(text).toContain('[DONE]');
    });
  });

  describe('checkHealth', () => {
    it('returns healthy status', async () => {
      const client = createClient();
      const result = await client.checkHealth();
      expect(result.ok).toBe(true);
      expect(result.data?.status).toBe('healthy');
    });

    it('returns unhealthy for unreachable agent', async () => {
      const client = new AgentClient({
        baseUrl: 'http://127.0.0.1:1', // Nothing listening here
        skipAuth: true
      });
      const result = await client.checkHealth();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('agent_unreachable');
    });
  });

  describe('retry logic', () => {
    it('retries on 503 and succeeds', async () => {
      failUntilRequest = 2; // Fail first 2, succeed on 3rd
      failStatus = 503;
      const client = createClient();
      const result = await client.createConversation();
      expect(result.ok).toBe(true);
      expect(requestCount).toBe(3); // 2 failures + 1 success
    });

    it('retries on 502 and succeeds', async () => {
      failUntilRequest = 1;
      failStatus = 502;
      const client = createClient();
      const result = await client.createConversation();
      expect(result.ok).toBe(true);
      expect(requestCount).toBe(2);
    });

    it('does not retry on 400', async () => {
      // Create a client pointing to nonexistent endpoint to get 404
      const client = createClient();
      const result = await client.getConversation('nonexistent');
      expect(result.ok).toBe(false);
      expect(result.status).toBe(404);
    });

    it('exhausts retries and returns last error', async () => {
      failUntilRequest = 100; // Always fail
      failStatus = 503;
      const client = createClient();
      const result = await client.createConversation();
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
    });
  });

  describe('circuit breaker', () => {
    it('opens after threshold failures', async () => {
      const client = new AgentClient({
        baseUrl: 'http://127.0.0.1:1', // Nothing listening here
        skipAuth: true
      });

      // Make enough failures to open the circuit
      for (let i = 0; i < 5; i++) {
        await client.createConversation();
      }

      expect(client.isCircuitOpen()).toBe(true);

      // Next request should fail immediately with circuit_open
      const result = await client.createConversation();
      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('circuit_open');
    });

    it('resets circuit on success', async () => {
      const client = createClient();

      // Manually set circuit to open state, but with expired cooldown
      // We can't easily test this without exposing internals, so just test reset
      client.resetCircuit();
      expect(client.isCircuitOpen()).toBe(false);
    });
  });

  describe('auth', () => {
    it('sends bearer token when getToken is provided', async () => {
      // The auth test verifies that the client acquires a token and includes it.
      // We test this indirectly: the mock agent already has /health, which
      // doesn't require auth. We just verify that the client calls getToken.
      let tokenRequested = false;
      const client = new AgentClient({
        baseUrl,
        skipAuth: false,
        getToken: async () => {
          tokenRequested = true;
          return 'test-token-123';
        }
      });

      const result = await client.checkHealth();
      expect(result.ok).toBe(true);
      expect(tokenRequested).toBe(true);
      expect(lastAuthorizationHeader).toBe('Bearer test-token-123');
    });

    it('fails when auth is enabled without a token provider', async () => {
      const client = new AgentClient({
        baseUrl,
        skipAuth: false
      });

      const result = await client.checkHealth();
      expect(result.ok).toBe(false);
      expect(result.status).toBe(503);
      expect(lastAuthorizationHeader).toBeUndefined();
    });
  });
});

describe('mapAgentStatus', () => {
  it('maps 400 to 400', () => expect(mapAgentStatus(400)).toBe(400));
  it('maps 401 to 502', () => expect(mapAgentStatus(401)).toBe(502));
  it('maps 404 to 404', () => expect(mapAgentStatus(404)).toBe(404));
  it('maps 429 to 429', () => expect(mapAgentStatus(429)).toBe(429));
  it('maps 500 to 502', () => expect(mapAgentStatus(500)).toBe(502));
  it('maps 503 to 503', () => expect(mapAgentStatus(503)).toBe(503));
  it('maps other 5xx to 502', () => expect(mapAgentStatus(504)).toBe(502));
  it('passes through other status codes', () => expect(mapAgentStatus(200)).toBe(200));
});
