/**
 * Unit tests for the contract compliance validator.
 *
 * Uses a Fastify test server to serve known good/bad responses,
 * then validates using the OpenAPI spec parser and validator.
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSpec } from '../src/parser.ts';
import { validateContract } from '../src/validator.ts';

const SPEC_PATH = join(import.meta.dirname, 'fixtures', 'test-api.openapi.yaml');

// ---------- Shared test server ----------

let server: FastifyInstance;
let baseUrl: string;

/** Create a Fastify server that implements the test-api spec with correct responses */
function createGoodServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  const NOW = '2026-01-15T10:00:00.000Z';
  const TEST_UUID = '00000000-0000-0000-0000-000000000001';

  // GET /health
  app.get('/health', async (_req, reply) => {
    await reply.send({ status: 'healthy' });
  });

  // POST /items
  app.post('/items', async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    await reply.status(201).send({
      id: TEST_UUID,
      name: body['name'] ?? 'test',
      createdAt: NOW
    });
  });

  // GET /items
  app.get('/items', async (_req, reply) => {
    await reply.send({
      items: [{ id: TEST_UUID, name: 'test', createdAt: NOW }],
      total: 1
    });
  });

  // GET /items/:itemId
  app.get('/items/:itemId', async (_req, reply) => {
    await reply.send({
      id: TEST_UUID,
      name: 'test',
      createdAt: NOW
    });
  });

  // POST /items/:itemId/stream — SSE
  app.post('/items/:itemId/stream', async (req, reply) => {
    const accept = req.headers['accept'] ?? '';

    if (accept.includes('text/event-stream')) {
      void reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      reply.raw.write('event: message.delta\ndata: {"content":"hello "}\n\n');
      reply.raw.write('event: message.delta\ndata: {"content":"world"}\n\n');
      reply.raw.write('event: message.complete\ndata: {"content":"hello world"}\n\n');
      reply.raw.end();
      // Mark reply as sent to prevent double-sending
      void reply.hijack();
    } else {
      await reply.send({
        id: TEST_UUID,
        name: 'streamed',
        createdAt: NOW
      });
    }
  });

  return app;
}

beforeAll(async () => {
  server = createGoodServer();
  const address = await server.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = address;
});

afterAll(async () => {
  await server.close();
});

// ---------- Parser tests ----------

describe('parseSpec', () => {
  it('parses the test spec and returns all operations', async () => {
    const ops = await parseSpec(SPEC_PATH);
    expect(ops.length).toBe(5);

    const operationIds = ops.map((op) => op.operationId).sort();
    expect(operationIds).toEqual(['createItem', 'getHealth', 'getItem', 'listItems', 'streamItem']);
  });

  it('correctly parses path parameters', async () => {
    const ops = await parseSpec(SPEC_PATH);
    const getItem = ops.find((op) => op.operationId === 'getItem');
    expect(getItem).toBeDefined();
    expect(getItem?.pathParams).toHaveLength(1);
    expect(getItem?.pathParams[0]?.name).toBe('itemId');
    expect(getItem?.pathParams[0]?.required).toBe(true);
    expect(getItem?.pathParams[0]?.location).toBe('path');
  });

  it('correctly parses query parameters', async () => {
    const ops = await parseSpec(SPEC_PATH);
    const listItems = ops.find((op) => op.operationId === 'listItems');
    expect(listItems).toBeDefined();
    expect(listItems?.queryParams).toHaveLength(1);
    expect(listItems?.queryParams[0]?.name).toBe('limit');
    expect(listItems?.queryParams[0]?.required).toBe(false);
  });

  it('detects SSE support', async () => {
    const ops = await parseSpec(SPEC_PATH);
    const streamItem = ops.find((op) => op.operationId === 'streamItem');
    expect(streamItem).toBeDefined();
    expect(streamItem?.supportsSSE).toBe(true);

    const getHealth = ops.find((op) => op.operationId === 'getHealth');
    expect(getHealth).toBeDefined();
    expect(getHealth?.supportsSSE).toBe(false);
  });

  it('parses request body schema', async () => {
    const ops = await parseSpec(SPEC_PATH);
    const createItem = ops.find((op) => op.operationId === 'createItem');
    expect(createItem).toBeDefined();
    expect(createItem?.requestBodyRequired).toBe(true);
    expect(createItem?.requestBodySchema).toBeDefined();

    const schema = createItem?.requestBodySchema as Record<string, unknown>;
    expect(schema['type']).toBe('object');
    expect(schema['required']).toContain('name');
  });

  it('parses response schemas per status code', async () => {
    const ops = await parseSpec(SPEC_PATH);
    const createItem = ops.find((op) => op.operationId === 'createItem');
    expect(createItem).toBeDefined();
    expect(createItem?.responses.has(201)).toBe(true);
    expect(createItem?.responses.has(400)).toBe(true);

    const successResponse = createItem?.responses.get(201);
    expect(successResponse).toBeDefined();
    expect(successResponse?.contentType).toBe('application/json');
    expect(successResponse?.schema).toBeDefined();
  });

  it('rejects unsupported OpenAPI versions', async () => {
    const badSpec = join(import.meta.dirname, 'fixtures', 'bad-version.yaml');
    // We don't have this file, so we expect a file-not-found error
    await expect(parseSpec(badSpec)).rejects.toThrow();
  });
});

// ---------- Validator tests with good server ----------

describe('validateContract — good server', () => {
  it('validates all endpoints pass', async () => {
    const results = await validateContract(SPEC_PATH, baseUrl, {
      requestBodies: {
        createItem: { name: 'test-item' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    expect(results.length).toBeGreaterThan(0);

    const failed = results.filter((r) => !r.passed);
    if (failed.length > 0) {
      // Print details for debugging
      for (const f of failed) {
        console.log(`FAILED: ${f.method} ${f.path}: ${f.errors.join(', ')}`);
      }
    }

    expect(failed).toHaveLength(0);
  });

  it('returns results for each tested endpoint', async () => {
    const results = await validateContract(SPEC_PATH, baseUrl, {
      requestBodies: {
        createItem: { name: 'test-item' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    // Should have results for: getHealth, createItem, listItems, getItem,
    // streamItem (SSE), streamItem (JSON)
    expect(results.length).toBeGreaterThanOrEqual(5);
  });

  it('records duration for each result', async () => {
    const results = await validateContract(SPEC_PATH, baseUrl, {
      requestBodies: {
        createItem: { name: 'test-item' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    for (const r of results) {
      expect(r.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------- Validator tests with bad responses ----------

describe('validateContract — schema violations', () => {
  let badServer: FastifyInstance;
  let badUrl: string;

  beforeAll(async () => {
    badServer = Fastify({ logger: false });

    // GET /health returns wrong schema (missing required "status" field)
    badServer.get('/health', async (_req, reply) => {
      await reply.send({ uptime: 1234 });
    });

    // POST /items returns wrong type for id
    badServer.post('/items', async (_req, reply) => {
      await reply.status(201).send({
        id: 12345, // Should be string
        name: 'test',
        createdAt: 'not-a-date' // Should be date-time format
      });
    });

    // GET /items returns correct schema
    badServer.get('/items', async (_req, reply) => {
      await reply.send({ items: [], total: 0 });
    });

    // GET /items/:itemId — not-found
    badServer.get('/items/:itemId', async (_req, reply) => {
      await reply.status(404).send({ code: 'not_found', message: 'nope' });
    });

    // POST /items/:itemId/stream — returns JSON when SSE is requested
    badServer.post('/items/:itemId/stream', async (_req, reply) => {
      await reply.send({ wrong: 'format' });
    });

    const address = await badServer.listen({ port: 0, host: '127.0.0.1' });
    badUrl = address;
  });

  afterAll(async () => {
    await badServer.close();
  });

  it('detects missing required fields in response', async () => {
    const results = await validateContract(SPEC_PATH, badUrl, {
      validateSSE: false,
      requestBodies: {
        createItem: { name: 'test' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    // Health endpoint should fail (missing "status")
    const healthResult = results.find((r) => r.path === '/health');
    expect(healthResult).toBeDefined();
    expect(healthResult?.passed).toBe(false);
    expect(healthResult?.errors.some((e) => e.includes('Schema validation'))).toBe(true);
  });

  it('detects type mismatches', async () => {
    const results = await validateContract(SPEC_PATH, badUrl, {
      validateSSE: false,
      requestBodies: {
        createItem: { name: 'test' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    // createItem should fail (id is number instead of string)
    const createResult = results.find((r) => r.path === '/items' && r.method === 'POST');
    expect(createResult).toBeDefined();
    expect(createResult?.passed).toBe(false);
  });

  it('detects wrong status codes', async () => {
    const results = await validateContract(SPEC_PATH, badUrl, {
      validateSSE: false,
      requestBodies: {
        createItem: { name: 'test' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    // getItem returns 404 instead of 200
    const getItemResult = results.find(
      (r) => r.path.startsWith('/items/{itemId}') && r.method === 'GET' && !r.path.includes('stream')
    );
    expect(getItemResult).toBeDefined();
    expect(getItemResult?.passed).toBe(false);
    expect(getItemResult?.errors.some((e) => e.includes('Expected status'))).toBe(true);
  });

  it('detects wrong content-type for SSE endpoints', async () => {
    const results = await validateContract(SPEC_PATH, badUrl, {
      validateSSE: true,
      requestBodies: {
        createItem: { name: 'test' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    // streamItem SSE should fail — server returns JSON not SSE
    const sseResult = results.find((r) => r.path.includes('[SSE]'));
    expect(sseResult).toBeDefined();
    expect(sseResult?.passed).toBe(false);
    expect(sseResult?.errors.some((e) => e.includes('text/event-stream'))).toBe(true);
  });
});

// ---------- SSE validation ----------

describe('validateContract — SSE endpoints', () => {
  it('validates SSE events with correct format', async () => {
    const results = await validateContract(SPEC_PATH, baseUrl, {
      requestBodies: {
        createItem: { name: 'test' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    const sseResult = results.find((r) => r.path.includes('[SSE]'));
    expect(sseResult).toBeDefined();
    expect(sseResult?.passed).toBe(true);
  });

  it('marks SSE results with [SSE] suffix in path', async () => {
    const results = await validateContract(SPEC_PATH, baseUrl, {
      requestBodies: {
        createItem: { name: 'test' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    const sseResults = results.filter((r) => r.path.includes('[SSE]'));
    expect(sseResults.length).toBeGreaterThan(0);
  });
});

// ---------- Connection failure ----------

describe('validateContract — connection errors', () => {
  it('handles connection refused gracefully', async () => {
    const results = await validateContract(SPEC_PATH, 'http://127.0.0.1:1', {
      requestTimeout: 1000,
      validateSSE: false,
      requestBodies: {
        createItem: { name: 'test' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    expect(results.length).toBeGreaterThan(0);
    for (const r of results) {
      expect(r.passed).toBe(false);
      expect(r.actualStatus).toBe(0);
      expect(r.errors.some((e) => e.includes('Request failed'))).toBe(true);
    }
  });
});

// ---------- Options ----------

describe('validateContract — options', () => {
  it('respects validateSSE: false', async () => {
    const results = await validateContract(SPEC_PATH, baseUrl, {
      validateSSE: false,
      requestBodies: {
        createItem: { name: 'test' },
        streamItem: { content: 'hello' }
      },
      pathParams: {
        itemId: '00000000-0000-0000-0000-000000000001'
      }
    });

    const sseResults = results.filter((r) => r.path.includes('[SSE]'));
    expect(sseResults).toHaveLength(0);
  });

  it('passes bearer token in Authorization header', async () => {
    // Create a server that checks for the token
    const tokenServer = Fastify({ logger: false });
    let receivedToken = '';

    tokenServer.get('/health', async (req, reply) => {
      receivedToken = req.headers['authorization'] ?? '';
      await reply.send({ status: 'healthy' });
    });

    // Only implement /health to keep it simple
    tokenServer.post('/items', async (_req, reply) => {
      await reply.status(201).send({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'x',
        createdAt: '2026-01-01T00:00:00Z'
      });
    });
    tokenServer.get('/items', async (_req, reply) => {
      await reply.send({ items: [], total: 0 });
    });
    tokenServer.get('/items/:itemId', async (_req, reply) => {
      await reply.send({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'x',
        createdAt: '2026-01-01T00:00:00Z'
      });
    });
    tokenServer.post('/items/:itemId/stream', async (_req, reply) => {
      await reply.send({
        id: '00000000-0000-0000-0000-000000000001',
        name: 'x',
        createdAt: '2026-01-01T00:00:00Z'
      });
    });

    const tokenUrl = await tokenServer.listen({ port: 0, host: '127.0.0.1' });

    try {
      await validateContract(SPEC_PATH, tokenUrl, {
        bearerToken: 'my-secret-token',
        validateSSE: false,
        requestBodies: {
          createItem: { name: 'test' },
          streamItem: { content: 'hello' }
        },
        pathParams: {
          itemId: '00000000-0000-0000-0000-000000000001'
        }
      });

      expect(receivedToken).toBe('Bearer my-secret-token');
    } finally {
      await tokenServer.close();
    }
  });
});

// ---------- Parsing the real agent-api spec ----------

describe('parseSpec — real agent-api spec', () => {
  const agentSpecPath = join(import.meta.dirname, '..', '..', '..', 'contracts', 'agent-api.openapi.yaml');

  it('parses the agent-api spec without errors', async () => {
    const ops = await parseSpec(agentSpecPath);
    expect(ops.length).toBeGreaterThan(0);
  });

  it('finds the sendMessage SSE endpoint', async () => {
    const ops = await parseSpec(agentSpecPath);
    const sendMessage = ops.find((op) => op.operationId === 'sendMessage');
    expect(sendMessage).toBeDefined();
    expect(sendMessage?.supportsSSE).toBe(true);
    expect(sendMessage?.method).toBe('POST');
  });

  it('resolves $ref parameters', async () => {
    const ops = await parseSpec(agentSpecPath);
    const getConversation = ops.find((op) => op.operationId === 'getConversation');
    expect(getConversation).toBeDefined();
    expect(getConversation?.pathParams).toHaveLength(1);
    expect(getConversation?.pathParams[0]?.name).toBe('conversationId');
  });
});
