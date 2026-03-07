/**
 * Fastify route definitions for the unified AI mock server.
 *
 * Implements three API surfaces plus health:
 * 1. Agent CRUD — /agents (create, get, update, delete, list) — Foundry Agent Service
 * 2. Responses API — served under BOTH path prefixes:
 *    - /responses (OpenAI-style, no prefix)
 *    - /openai/responses (Foundry-style, with /openai prefix)
 * 3. Conversations API — served under BOTH path prefixes:
 *    - /conversations (OpenAI-style, no prefix)
 *    - /openai/conversations (Foundry-style, with /openai prefix)
 * 4. Health — /health
 *
 * All endpoints accept ?api-version= query param (ignored — mock returns same data).
 * Bearer token is required unless X-Mock-Skip-Auth header is set.
 * Supports X-Mock-Latency and X-Mock-Error headers for test control.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createAgent,
  createConversation,
  createResponse,
  deleteAgent,
  deleteConversation,
  deleteResponse,
  getAgent,
  getConversation,
  getResponse,
  getResponseStreamEvents,
  listAgents,
  updateAgent
} from './store.ts';
import type { CreateResponseRequest, PromptAgentDefinition } from './types.ts';

// ---------- Auth middleware ----------

function checkAuth(req: FastifyRequest, reply: FastifyReply): boolean {
  if (req.headers['x-mock-skip-auth']) return true;

  const auth = req.headers['authorization'];
  if (!auth || !auth.startsWith('Bearer ')) {
    void reply.status(401).send({
      error: {
        code: 'unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer <token>'
      }
    });
    return false;
  }
  return true;
}

// ---------- Latency / error injection ----------

async function applyMockControls(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const latency = req.headers['x-mock-latency'];
  if (latency) {
    const ms = parseInt(String(latency), 10);
    if (!isNaN(ms) && ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  const errorCode = req.headers['x-mock-error'];
  if (errorCode) {
    const status = parseInt(String(errorCode), 10);
    if (!isNaN(status) && status >= 400) {
      void reply.status(status).send({
        error: {
          code: 'mock_injected_error',
          message: `Error injected by X-Mock-Error header (status ${String(status)})`
        }
      });
      return true;
    }
  }

  return false;
}

// ---------- Responses API handler (shared by both prefixes) ----------

async function handleCreateResponse(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!checkAuth(req, reply)) return;
  if (await applyMockControls(req, reply)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;

  const input = body['input'];
  if (input === undefined || input === null || input === '') {
    await reply.status(400).send({
      error: { code: 'bad_request', message: 'Missing required field: input' }
    });
    return;
  }

  const request: CreateResponseRequest = {
    model: body['model'] as string | undefined,
    input: input as string | CreateResponseRequest['input'],
    instructions: body['instructions'] as string | undefined,
    tools: body['tools'] as CreateResponseRequest['tools'],
    stream: body['stream'] === true,
    previous_response_id: body['previous_response_id'] as string | undefined,
    conversation: body['conversation'] as CreateResponseRequest['conversation'],
    metadata: body['metadata'] as Record<string, string> | undefined
  };

  const response = createResponse(request);

  // If streaming was requested, send SSE
  if (request.stream) {
    const events = getResponseStreamEvents(response);

    void reply.hijack();

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive'
    });

    for (const evt of events) {
      reply.raw.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
    }

    reply.raw.write('data: [DONE]\n\n');
    reply.raw.end();
    return;
  }

  await reply.send(response);
}

async function handleGetResponse(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!checkAuth(req, reply)) return;
  if (await applyMockControls(req, reply)) return;

  const { responseId } = req.params as { responseId: string };
  const response = getResponse(responseId);
  if (!response) {
    await reply.status(404).send({
      error: { code: 'not_found', message: `Response ${responseId} not found` }
    });
    return;
  }
  await reply.send(response);
}

async function handleDeleteResponse(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!checkAuth(req, reply)) return;
  if (await applyMockControls(req, reply)) return;

  const { responseId } = req.params as { responseId: string };
  const deleted = deleteResponse(responseId);
  if (!deleted) {
    await reply.status(404).send({
      error: { code: 'not_found', message: `Response ${responseId} not found` }
    });
    return;
  }
  await reply.send({ id: responseId, object: 'response.deleted', deleted: true });
}

// ---------- Conversations API handlers ----------

async function handleCreateConversation(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!checkAuth(req, reply)) return;
  if (await applyMockControls(req, reply)) return;

  const body = (req.body ?? {}) as Record<string, unknown>;
  const metadata = (body['metadata'] as Record<string, string> | undefined) ?? null;

  const conversation = createConversation(metadata);
  await reply.send(conversation);
}

async function handleGetConversation(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!checkAuth(req, reply)) return;
  if (await applyMockControls(req, reply)) return;

  const { conversationId } = req.params as { conversationId: string };
  const conversation = getConversation(conversationId);
  if (!conversation) {
    await reply.status(404).send({
      error: { code: 'not_found', message: `Conversation ${conversationId} not found` }
    });
    return;
  }
  await reply.send(conversation);
}

async function handleDeleteConversation(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!checkAuth(req, reply)) return;
  if (await applyMockControls(req, reply)) return;

  const { conversationId } = req.params as { conversationId: string };
  const deleted = deleteConversation(conversationId);
  if (!deleted) {
    await reply.status(404).send({
      error: { code: 'not_found', message: `Conversation ${conversationId} not found` }
    });
    return;
  }
  await reply.send(deleted);
}

// ---------- Route registration ----------

export function registerRoutes(app: FastifyInstance): void {
  // ---- Health ----
  app.get('/health', { logLevel: 'silent' }, async (_req, reply) => {
    await reply.send({ status: 'healthy' });
  });

  // ============================================================
  // Agent CRUD routes (Foundry Agent Service)
  // ============================================================

  // ---- POST /agents/:name — create agent ----
  app.post('/agents/:name', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    if (await applyMockControls(req, reply)) return;

    const { name } = req.params as { name: string };
    const body = (req.body ?? {}) as Record<string, unknown>;

    const definition: PromptAgentDefinition = {
      kind: 'prompt',
      model: (body['model'] as string | undefined) ?? 'gpt-5.2-chat',
      instructions: body['instructions'] as string | undefined,
      tools: body['tools'] as PromptAgentDefinition['tools']
    };

    const agent = createAgent(name, definition);
    await reply.status(200).send(agent);
  });

  // ---- PATCH /agents/:name — update agent ----
  app.patch('/agents/:name', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    if (await applyMockControls(req, reply)) return;

    const { name } = req.params as { name: string };
    const body = (req.body ?? {}) as Record<string, unknown>;

    const definition: PromptAgentDefinition = {
      kind: 'prompt',
      model: (body['model'] as string | undefined) ?? 'gpt-5.2-chat',
      instructions: body['instructions'] as string | undefined,
      tools: body['tools'] as PromptAgentDefinition['tools']
    };

    const agent = updateAgent(name, definition);
    if (!agent) {
      await reply.status(404).send({
        error: { code: 'not_found', message: `Agent "${name}" not found` }
      });
      return;
    }
    await reply.send(agent);
  });

  // ---- GET /agents/:name — get agent ----
  app.get('/agents/:name', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    if (await applyMockControls(req, reply)) return;

    const { name } = req.params as { name: string };
    const agent = getAgent(name);
    if (!agent) {
      await reply.status(404).send({
        error: { code: 'not_found', message: `Agent "${name}" not found` }
      });
      return;
    }
    await reply.send(agent);
  });

  // ---- DELETE /agents/:name — delete agent ----
  app.delete('/agents/:name', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    if (await applyMockControls(req, reply)) return;

    const { name } = req.params as { name: string };
    const deleted = deleteAgent(name);
    if (!deleted) {
      await reply.status(404).send({
        error: { code: 'not_found', message: `Agent "${name}" not found` }
      });
      return;
    }
    await reply.send({ name, object: 'agent.deleted', deleted: true });
  });

  // ---- GET /agents — list agents ----
  app.get('/agents', async (req, reply) => {
    if (!checkAuth(req, reply)) return;
    if (await applyMockControls(req, reply)) return;

    const list = listAgents();
    await reply.send(list);
  });

  // ============================================================
  // Responses API routes — registered under BOTH prefixes
  // ============================================================

  // Register under /responses (OpenAI-style, no prefix)
  app.post('/responses', handleCreateResponse);
  app.get('/responses/:responseId', handleGetResponse);
  app.delete('/responses/:responseId', handleDeleteResponse);

  // Register under /openai/responses (Foundry-style, with /openai prefix)
  app.post('/openai/responses', handleCreateResponse);
  app.get('/openai/responses/:responseId', handleGetResponse);
  app.delete('/openai/responses/:responseId', handleDeleteResponse);

  // ============================================================
  // Conversations API routes — registered under BOTH prefixes
  // ============================================================

  // Register under /conversations (OpenAI-style, no prefix)
  app.post('/conversations', handleCreateConversation);
  app.get('/conversations/:conversationId', handleGetConversation);
  app.delete('/conversations/:conversationId', handleDeleteConversation);

  // Register under /openai/conversations (Foundry-style, with /openai prefix)
  app.post('/openai/conversations', handleCreateConversation);
  app.get('/openai/conversations/:conversationId', handleGetConversation);
  app.delete('/openai/conversations/:conversationId', handleDeleteConversation);
}
