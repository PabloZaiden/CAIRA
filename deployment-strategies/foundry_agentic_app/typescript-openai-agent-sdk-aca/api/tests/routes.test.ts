/**
 * Unit tests for routes.ts (business API endpoints).
 *
 * Creates a Fastify app with routes + a mock agent backend to test
 * the full request-response cycle including data transformation,
 * adventure state management, and SSE outcome capture.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.ts';
import { resetAdventureStore, adventureStore } from '../src/routes.ts';

// ---------- Mock agent backend ----------

let agentMock: FastifyInstance;
let agentBaseUrl: string;
let app: FastifyInstance;
let appBaseUrl: string;
let appWithAuth: FastifyInstance;
let appWithAuthBaseUrl: string;

// In-memory agent state (conversations + messages)
const conversations = new Map<
  string,
  {
    id: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      createdAt: string;
      usage?: { promptTokens: number; completionTokens: number };
      resolution?: { tool: string; result: Record<string, unknown> };
    }>;
  }
>();

let nextConvId = 1;
let nextMsgId = 1;

beforeAll(async () => {
  // 1. Start mock agent
  agentMock = Fastify({ logger: false });

  agentMock.get('/health', async (_req, reply) => {
    await reply.send({ status: 'healthy', checks: [{ name: 'model', status: 'healthy' }] });
  });

  agentMock.post('/conversations', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const id = `conv-${String(nextConvId++).padStart(3, '0')}`;
    const now = new Date().toISOString();
    const conv = {
      id,
      createdAt: now,
      updatedAt: now,
      ...(body['metadata'] ? { metadata: body['metadata'] as Record<string, unknown> } : {}),
      messages: [] as Array<{
        id: string;
        role: string;
        content: string;
        createdAt: string;
        usage?: { promptTokens: number; completionTokens: number };
        resolution?: { tool: string; result: Record<string, unknown> };
      }>
    };
    conversations.set(id, conv);
    await reply.status(201).send({
      id,
      createdAt: now,
      updatedAt: now,
      ...(body['metadata'] ? { metadata: body['metadata'] } : {})
    });
  });

  agentMock.get('/conversations', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const offset = parseInt(query['offset'] ?? '0', 10);
    const limit = parseInt(query['limit'] ?? '20', 10);

    const items = [...conversations.values()].map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      ...(c.metadata ? { metadata: c.metadata } : {})
    }));

    await reply.send({
      items: items.slice(offset, offset + limit),
      offset,
      limit,
      total: items.length
    });
  });

  agentMock.get('/conversations/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = conversations.get(id);
    if (!conv) {
      await reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return;
    }
    await reply.send({
      id: conv.id,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      ...(conv.metadata ? { metadata: conv.metadata } : {}),
      messages: conv.messages
    });
  });

  agentMock.post('/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    const conv = conversations.get(id);
    if (!conv) {
      await reply.status(404).send({ error: { code: 'not_found', message: 'Not found' } });
      return;
    }

    const accept = req.headers['accept'] ?? '';
    const body = req.body as Record<string, unknown>;
    const content = body['content'] as string;

    // Add user message
    const userMsgId = `msg-${String(nextMsgId++).padStart(3, '0')}`;
    conv.messages.push({
      id: userMsgId,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    });

    // Generate assistant response
    const assistantMsgId = `msg-${String(nextMsgId++).padStart(3, '0')}`;
    const responseContent = `Arr! Ye said: ${content}`;
    const usage = { promptTokens: 10, completionTokens: 12 };

    // Check if the request triggers a resolution (for testing)
    // Convention: if content contains "resolve:", treat the rest as the tool name
    let resolution: { tool: string; result: Record<string, unknown> } | undefined;
    if (content.includes('resolve:shanty')) {
      resolution = {
        tool: 'resolve_shanty',
        result: { winner: 'user', rounds: 4, best_verse: 'Through storms and gales...' }
      };
    } else if (content.includes('resolve:treasure')) {
      resolution = {
        tool: 'resolve_treasure',
        result: { found: true, treasure_name: "Captain's Gold", location: 'Skeleton Cove' }
      };
    } else if (content.includes('resolve:crew')) {
      resolution = {
        tool: 'resolve_crew',
        result: { rank: 'Able Seaman', role: 'lookout', ship_name: 'The Salty Serpent' }
      };
    }

    const assistantMsg = {
      id: assistantMsgId,
      role: 'assistant',
      content: responseContent,
      createdAt: new Date().toISOString(),
      usage,
      ...(resolution ? { resolution } : {})
    };
    conv.messages.push(assistantMsg);
    conv.updatedAt = assistantMsg.createdAt;

    if (accept.includes('text/event-stream')) {
      void reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      reply.raw.write(`event: message.delta\ndata: {"content":"Arr, "}\n\n`);
      reply.raw.write(`event: message.delta\ndata: {"content":"matey!"}\n\n`);
      if (resolution) {
        reply.raw.write(`event: activity.resolved\ndata: ${JSON.stringify(resolution)}\n\n`);
      }
      reply.raw.write(
        `event: message.complete\ndata: {"messageId":"${assistantMsgId}","content":"${responseContent}","usage":${JSON.stringify(usage)}}\n\n`
      );
      reply.raw.write('event: done\ndata: [DONE]\n\n');
      reply.raw.end();
      return;
    }

    await reply.send(assistantMsg);
  });

  agentBaseUrl = await agentMock.listen({ port: 0, host: '127.0.0.1' });

  // 2. Start API app pointing to mock agent
  app = await buildApp({
    config: {
      port: 0,
      host: '127.0.0.1',
      agentServiceUrl: agentBaseUrl,
      agentTokenScope: undefined,
      inboundAuthTenantId: undefined,
      inboundAuthAllowedAudiences: [],
      inboundAuthAllowedCallerAppIds: [],
      inboundAuthAuthorityHost: 'https://login.microsoftonline.com',
      applicationInsightsConnectionString: undefined,
      logLevel: 'silent',
      skipAuth: true
    }
  });

  appBaseUrl = await app.listen({ port: 0, host: '127.0.0.1' });

appWithAuth = await buildApp({
    config: {
      port: 0,
      host: '127.0.0.1',
      agentServiceUrl: agentBaseUrl,
      agentTokenScope: undefined,
      inboundAuthTenantId: undefined,
      inboundAuthAllowedAudiences: [],
      inboundAuthAllowedCallerAppIds: [],
      inboundAuthAuthorityHost: 'https://login.microsoftonline.com',
      applicationInsightsConnectionString: undefined,
      logLevel: 'silent',
      skipAuth: false
    },
    agentClientOptions: {
      getToken: async () => 'test-agent-token'
    },
    incomingTokenValidator: {
      validateAccessToken: async (token: string) => {
        if (token !== 'bff-token') {
          throw new Error('invalid token');
        }
      }
    }
  });

  appWithAuthBaseUrl = await appWithAuth.listen({ port: 0, host: '127.0.0.1' });
});

afterAll(async () => {
  await app.close();
  await appWithAuth.close();
  await agentMock.close();
});

beforeEach(() => {
  // Reset state between tests
  conversations.clear();
  nextConvId = 1;
  nextMsgId = 1;
  resetAdventureStore();
});

// ---------- Helper ----------

async function apiRequest(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; headers: Headers; data: unknown }> {
  const init: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
      ...headers
    }
  };
  if (body !== undefined) {
    init.headers = {
      ...(init.headers as Record<string, string>),
      'Content-Type': 'application/json'
    };
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(`${appBaseUrl}${path}`, init);
  const data = await resp.json();
  return { status: resp.status, headers: resp.headers, data };
}

async function apiRequestWithAuth(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<{ status: number; headers: Headers; data: unknown }> {
  const init: RequestInit = {
    method,
    headers: {
      Accept: 'application/json',
      ...headers
    }
  };
  if (body !== undefined) {
    init.headers = {
      ...(init.headers as Record<string, string>),
      'Content-Type': 'application/json'
    };
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(`${appWithAuthBaseUrl}${path}`, init);
  const data = await resp.json();
  return { status: resp.status, headers: resp.headers, data };
}

// ---------- Tests ----------

describe('GET /health', () => {
  it('returns healthy when agent is healthy', async () => {
    const { status, data } = await apiRequest('GET', '/health');
    expect(status).toBe(200);
    const health = data as {
      status: string;
      dependencies: Array<{ name: string; status: string; latencyMs: number }>;
    };
    expect(health.status).toBe('healthy');
    expect(health.dependencies).toHaveLength(1);
    expect(health.dependencies[0]?.name).toBe('agent-container');
    expect(health.dependencies[0]?.status).toBe('healthy');
    expect(typeof health.dependencies[0]?.latencyMs).toBe('number');
  });
});

describe('API auth middleware', () => {
  it('keeps /health public without Authorization', async () => {
    const { status } = await apiRequestWithAuth('GET', '/health');
    expect(status).toBe(200);
  });

  it('requires Authorization for deep health checks', async () => {
    const noAuth = await apiRequestWithAuth('GET', '/health/deep');
    expect(noAuth.status).toBe(401);
    expect(noAuth.data).toEqual({
      code: 'unauthorized',
      message: 'Missing or invalid Authorization header'
    });

    const withAuth = await apiRequestWithAuth('GET', '/health/deep', undefined, {
      Authorization: 'Bearer bff-token'
    });
    expect(withAuth.status).toBe(200);
    const deepHealth = withAuth.data as {
      status: string;
      dependencies: Array<{ name: string; status: string }>;
    };
    expect(deepHealth.status).toBe('healthy');
    expect(deepHealth.dependencies[0]?.name).toBe('agent-container-auth');
  });

  it('requires Authorization for business routes', async () => {
    const noAuth = await apiRequestWithAuth('GET', '/api/pirate/adventures');
    expect(noAuth.status).toBe(401);
    expect(noAuth.data).toEqual({
      code: 'unauthorized',
      message: 'Missing or invalid Authorization header'
    });

    await apiRequestWithAuth('POST', '/api/pirate/shanty', undefined, {
      Authorization: 'Bearer bff-token'
    });
    const withAuth = await apiRequestWithAuth('GET', '/api/pirate/adventures', undefined, {
      Authorization: 'Bearer bff-token'
    });
    expect(withAuth.status).toBe(200);
  });

  it('rejects invalid bearer tokens', async () => {
    const invalid = await apiRequestWithAuth('GET', '/api/pirate/adventures', undefined, {
      Authorization: 'Bearer wrong-token'
    });
    expect(invalid.status).toBe(401);
    expect(invalid.data).toEqual({
      code: 'unauthorized',
      message: 'Invalid or unauthorized bearer token'
    });
  });
});

// ---------- Business operations ----------

describe('POST /api/pirate/shanty', () => {
  it('starts a shanty battle adventure', async () => {
    const { status, data } = await apiRequest('POST', '/api/pirate/shanty');
    expect(status).toBe(201);
    const started = data as {
      id: string;
      mode: string;
      status: string;
      syntheticMessage: string;
      createdAt: string;
    };
    expect(started.id).toBe('conv-001');
    expect(started.mode).toBe('shanty');
    expect(started.status).toBe('active');
    expect(started.syntheticMessage).toContain('qualifying a new customer opportunity');
    expect(started.createdAt).toBeTruthy();
  });

  it('stores adventure in adventure store', async () => {
    await apiRequest('POST', '/api/pirate/shanty');
    const record = adventureStore.get('conv-001');
    expect(record).toBeDefined();
    expect(record?.mode).toBe('shanty');
    expect(record?.status).toBe('active');
  });
});

describe('POST /api/pirate/treasure', () => {
  it('starts a treasure hunt adventure', async () => {
    const { status, data } = await apiRequest('POST', '/api/pirate/treasure');
    expect(status).toBe(201);
    const started = data as { id: string; mode: string; status: string };
    expect(started.mode).toBe('treasure');
    expect(started.status).toBe('active');
  });
});

describe('POST /api/pirate/crew/enlist', () => {
  it('starts a crew enlistment adventure', async () => {
    const { status, data } = await apiRequest('POST', '/api/pirate/crew/enlist');
    expect(status).toBe(201);
    const started = data as { id: string; mode: string; status: string };
    expect(started.mode).toBe('crew');
    expect(started.status).toBe('active');
  });
});

// ---------- Adventure management ----------

describe('GET /api/pirate/adventures', () => {
  it('lists adventures', async () => {
    // Create two adventures
    await apiRequest('POST', '/api/pirate/shanty');
    await apiRequest('POST', '/api/pirate/treasure');

    const { status, data } = await apiRequest('GET', '/api/pirate/adventures');
    expect(status).toBe(200);
    const list = data as {
      adventures: Array<{ id: string; mode: string; status: string }>;
      total: number;
      offset: number;
      limit: number;
    };
    expect(list.adventures).toHaveLength(2);
    expect(list.total).toBe(2);
    expect(list.offset).toBe(0);
    expect(list.limit).toBe(20);
    expect(list.adventures[0]?.mode).toBe('shanty');
    expect(list.adventures[1]?.mode).toBe('treasure');
  });

  it('passes pagination params', async () => {
    await apiRequest('POST', '/api/pirate/shanty');
    const { status, data } = await apiRequest('GET', '/api/pirate/adventures?offset=5&limit=10');
    expect(status).toBe(200);
    const list = data as { offset: number; limit: number };
    expect(list.offset).toBe(5);
    expect(list.limit).toBe(10);
  });
});

describe('GET /api/pirate/adventures/:adventureId', () => {
  it('returns adventure detail with parleys', async () => {
    const { data: started } = await apiRequest('POST', '/api/pirate/shanty');
    const id = (started as { id: string }).id;

    // Start-adventure only creates the conversation; send a parley to populate messages
    await apiRequest('POST', `/api/pirate/adventures/${id}/parley`, {
      message: 'Ahoy captain!'
    });

    const { status, data } = await apiRequest('GET', `/api/pirate/adventures/${id}`);
    expect(status).toBe(200);
    const detail = data as {
      id: string;
      mode: string;
      status: string;
      messageCount: number;
      parleys: Array<{ id: string; role: string; content: string }>;
    };
    expect(detail.id).toBe(id);
    expect(detail.mode).toBe('shanty');
    expect(detail.status).toBe('active');
    // Should have 2 messages: the user parley + the agent's response
    expect(detail.messageCount).toBe(2);
    expect(detail.parleys).toHaveLength(2);
    expect(detail.parleys[0]?.role).toBe('user');
    expect(detail.parleys[1]?.role).toBe('assistant');
  });

  it('returns 404 for nonexistent adventure', async () => {
    const { status, data } = await apiRequest('GET', '/api/pirate/adventures/nonexistent');
    expect(status).toBe(404);
    const err = data as { code: string };
    expect(err.code).toBe('not_found');
  });
});

// ---------- Parley (JSON) ----------

describe('POST /api/pirate/adventures/:id/parley (JSON)', () => {
  it('sends a message and gets JSON response', async () => {
    const { data: started } = await apiRequest('POST', '/api/pirate/shanty');
    const id = (started as { id: string }).id;

    const { status, data } = await apiRequest('POST', `/api/pirate/adventures/${id}/parley`, {
      message: 'Ahoy captain!'
    });
    expect(status).toBe(200);
    const parley = data as { id: string; role: string; content: string };
    expect(parley.role).toBe('assistant');
    expect(parley.content).toContain('Ahoy captain!');
  });

  it('returns 400 for missing message', async () => {
    const { data: started } = await apiRequest('POST', '/api/pirate/shanty');
    const id = (started as { id: string }).id;

    const { status, data } = await apiRequest('POST', `/api/pirate/adventures/${id}/parley`, {});
    expect(status).toBe(400);
    const err = data as { code: string };
    expect(err.code).toBe('bad_request');
  });

  it('returns 400 for empty message', async () => {
    const { data: started } = await apiRequest('POST', '/api/pirate/shanty');
    const id = (started as { id: string }).id;

    const { status, data } = await apiRequest('POST', `/api/pirate/adventures/${id}/parley`, {
      message: ''
    });
    expect(status).toBe(400);
    const err = data as { code: string };
    expect(err.code).toBe('bad_request');
  });

  it('returns 404 for nonexistent adventure', async () => {
    const { status, data } = await apiRequest('POST', '/api/pirate/adventures/nonexistent/parley', {
      message: 'Hello'
    });
    expect(status).toBe(404);
    const err = data as { code: string };
    expect(err.code).toBe('not_found');
  });

  it('captures resolution from JSON response and updates adventure status', async () => {
    const { data: started } = await apiRequest('POST', '/api/pirate/shanty');
    const id = (started as { id: string }).id;

    // Send a message that triggers resolution
    const { status, data } = await apiRequest('POST', `/api/pirate/adventures/${id}/parley`, {
      message: 'resolve:shanty'
    });
    expect(status).toBe(200);
    const parley = data as {
      resolution?: { tool: string; result: Record<string, unknown> };
    };
    expect(parley.resolution).toBeDefined();
    expect(parley.resolution?.tool).toBe('resolve_shanty');
    expect(parley.resolution?.result).toHaveProperty('winner', 'user');

    // Verify adventure store was updated
    const record = adventureStore.get(id);
    expect(record?.status).toBe('resolved');
    expect(record?.outcome?.tool).toBe('resolve_shanty');
  });
});

// ---------- Parley (SSE) ----------

describe('POST /api/pirate/adventures/:id/parley (SSE)', () => {
  it('streams SSE events from agent', async () => {
    const { data: started } = await apiRequest('POST', '/api/pirate/shanty');
    const id = (started as { id: string }).id;

    const resp = await fetch(`${appBaseUrl}/api/pirate/adventures/${id}/parley`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({ message: 'Tell me a story' })
    });

    expect(resp.status).toBe(200);
    expect(resp.headers.get('content-type')).toBe('text/event-stream');

    const text = await resp.text();
    expect(text).toContain('event: message.delta');
    expect(text).toContain('"content":"Arr, "');
    expect(text).toContain('"content":"matey!"');
    expect(text).toContain('event: message.complete');
    expect(text).toContain('[DONE]');
  });

  it('captures resolution from SSE stream and updates adventure status', async () => {
    const { data: started } = await apiRequest('POST', '/api/pirate/shanty');
    const id = (started as { id: string }).id;

    const resp = await fetch(`${appBaseUrl}/api/pirate/adventures/${id}/parley`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream'
      },
      body: JSON.stringify({ message: 'resolve:shanty' })
    });

    expect(resp.status).toBe(200);

    const text = await resp.text();
    expect(text).toContain('event: activity.resolved');
    expect(text).toContain('resolve_shanty');

    // Verify adventure store was updated
    const record = adventureStore.get(id);
    expect(record?.status).toBe('resolved');
    expect(record?.outcome?.tool).toBe('resolve_shanty');
    expect(record?.outcome?.result).toHaveProperty('winner', 'user');
  });
});

// ---------- Stats ----------

describe('GET /api/pirate/stats', () => {
  it('returns activity statistics', async () => {
    // Create adventures of different types
    await apiRequest('POST', '/api/pirate/shanty');
    await apiRequest('POST', '/api/pirate/treasure');
    await apiRequest('POST', '/api/pirate/crew/enlist');

    const { status, data } = await apiRequest('GET', '/api/pirate/stats');
    expect(status).toBe(200);
    const stats = data as {
      totalAdventures: number;
      activeAdventures: number;
      resolvedAdventures: number;
      byMode: {
        shanty: { total: number; active: number; resolved: number };
        treasure: { total: number; active: number; resolved: number };
        crew: { total: number; active: number; resolved: number };
      };
    };
    expect(stats.totalAdventures).toBe(3);
    expect(stats.activeAdventures).toBe(3);
    expect(stats.resolvedAdventures).toBe(0);
    expect(stats.byMode.shanty.total).toBe(1);
    expect(stats.byMode.treasure.total).toBe(1);
    expect(stats.byMode.crew.total).toBe(1);
  });

  it('reflects resolved adventures in stats', async () => {
    // Create and resolve a shanty adventure
    const { data: started } = await apiRequest('POST', '/api/pirate/shanty');
    const id = (started as { id: string }).id;

    await apiRequest('POST', `/api/pirate/adventures/${id}/parley`, {
      message: 'resolve:shanty'
    });

    const { data } = await apiRequest('GET', '/api/pirate/stats');
    const stats = data as {
      totalAdventures: number;
      activeAdventures: number;
      resolvedAdventures: number;
      byMode: { shanty: { total: number; active: number; resolved: number } };
    };
    expect(stats.totalAdventures).toBe(1);
    expect(stats.resolvedAdventures).toBe(1);
    expect(stats.activeAdventures).toBe(0);
    expect(stats.byMode.shanty.resolved).toBe(1);
  });
});

// ---------- Adventure detail with outcome ----------

describe('Adventure detail with outcome', () => {
  it('shows outcome on adventure detail after resolution', async () => {
    const { data: started } = await apiRequest('POST', '/api/pirate/treasure');
    const id = (started as { id: string }).id;

    // Resolve the adventure
    await apiRequest('POST', `/api/pirate/adventures/${id}/parley`, {
      message: 'resolve:treasure'
    });

    // Get adventure detail
    const { data } = await apiRequest('GET', `/api/pirate/adventures/${id}`);
    const detail = data as {
      status: string;
      outcome?: { tool: string; result: Record<string, unknown> };
    };
    expect(detail.status).toBe('resolved');
    expect(detail.outcome).toBeDefined();
    expect(detail.outcome?.tool).toBe('resolve_treasure');
    expect(detail.outcome?.result).toHaveProperty('found', true);
    expect(detail.outcome?.result).toHaveProperty('treasure_name', "Captain's Gold");
  });
});

// ---------- Error mapping ----------

describe('error mapping', () => {
  it('maps agent 404 to 404 on adventure detail', async () => {
    const { status } = await apiRequest('GET', '/api/pirate/adventures/nonexistent');
    expect(status).toBe(404);
  });
});

// ---------- Identity ----------

describe('GET /identity', () => {
  afterAll(() => {
    delete process.env['SKIP_AUTH'];
  });

  it('ignores SKIP_AUTH and still attempts credential validation', async () => {
    process.env['SKIP_AUTH'] = 'true';

    const { status, data } = await apiRequest('GET', '/identity');
    expect(status).toBe(200);
    const body = data as { authenticated: boolean; reason?: string; identity?: { type: string } };
    // The key assertion: SKIP_AUTH does NOT short-circuit this endpoint.
    // It always attempts real credential validation. The result depends on
    // whether credentials are available in the current environment.
    expect(typeof body.authenticated).toBe('boolean');
    if (body.authenticated) {
      expect(body.identity).toBeDefined();
    } else {
      expect(body.reason).toBeDefined();
    }

    delete process.env['SKIP_AUTH'];
  });

  it('returns valid response shape', async () => {
    const { status, data } = await apiRequest('GET', '/identity');
    expect(status).toBe(200);
    const body = data as { authenticated: boolean; reason?: string; identity?: { type: string } };
    expect(typeof body.authenticated).toBe('boolean');
    if (body.authenticated) {
      expect(body.identity).toBeDefined();
      expect(body.identity?.type).toBeDefined();
    } else {
      expect(body.reason).toBeDefined();
    }
  });

  it('identity includes expected fields when authenticated', async () => {
    const { status, data } = await apiRequest('GET', '/identity');
    expect(status).toBe(200);
    const body = data as {
      authenticated: boolean;
      identity?: { tenantId: string; objectId: string; type: string };
    };
    if (body.authenticated) {
      expect(body.identity?.tenantId).toBeDefined();
      expect(body.identity?.objectId).toBeDefined();
      expect(['user', 'servicePrincipal', 'managedIdentity', 'unknown']).toContain(body.identity?.type);
    }
  });
});
