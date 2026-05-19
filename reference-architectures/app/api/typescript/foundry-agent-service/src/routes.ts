/**
 * Fastify route definitions for the agent container API.
 *
 * Implements contracts/agent-api.openapi.yaml:
 *   POST   /conversations                          -> createConversation
 *   GET    /conversations                          -> listConversations
 *   GET    /conversations/:conversationId          -> getConversation
 *   POST   /conversations/:conversationId/messages -> sendMessage (SSE or JSON)
 *   GET    /health                                 -> health check
 *   GET    /metrics                                -> Prometheus metrics
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FoundryClient } from './foundry-client.ts';
import type { ErrorResponse } from './types.ts';
import { randomUUID } from 'node:crypto';
import { createAzureCredential } from './azure-credential.ts';

// ---------- Trace ID helper ----------

/** Extract trace ID from incoming request header, or generate a new one. */
function getTraceId(req: FastifyRequest): string {
  const header = req.headers['x-trace-id'];
  if (typeof header === 'string' && header.length > 0) return header;
  return randomUUID();
}

// ---------- Metrics counters ----------

interface Metrics {
  requestCount: number;
  conversationsCreated: number;
  messagesSent: number;
  errorsTotal: number;
  promptTokensTotal: number;
  completionTokensTotal: number;
}

const metrics: Metrics = {
  requestCount: 0,
  conversationsCreated: 0,
  messagesSent: 0,
  errorsTotal: 0,
  promptTokensTotal: 0,
  completionTokensTotal: 0
};

// ---------- Helpers ----------

function errorReply(reply: FastifyReply, status: number, code: string, message: string): void {
  metrics.errorsTotal++;
  const body: ErrorResponse = { code, message };
  void reply.status(status).send(body);
}

function isValidId(s: string): boolean {
  // Accept UUIDs, conv-style IDs (conv_1234_abc), and any
  // reasonable alphanumeric identifier. Reject empty or whitespace-only.
  return s.length > 0 && /^[\w-]+$/.test(s);
}

/**
 * Decode the payload section of a JWT token (base64url -> JSON).
 * Does NOT verify the signature -- this is a diagnostic endpoint.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) return {};
  const payload = parts[1] ?? '';
  // base64url -> base64
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  const json = Buffer.from(base64, 'base64').toString('utf-8');
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Infer identity type from JWT claims.
 */
function inferIdentityType(claims: Record<string, unknown>): string {
  // Managed identity tokens have xms_mirid claim
  if (claims['xms_mirid']) return 'managedIdentity';
  // Service principal tokens have appid but no name
  if (claims['appid'] && !claims['name']) return 'servicePrincipal';
  // User tokens have a name claim
  if (claims['name']) return 'user';
  return 'unknown';
}

// ---------- Route registration ----------

export function registerRoutes(app: FastifyInstance, foundryClient: FoundryClient): void {
  // Track all requests
  app.addHook('onRequest', async () => {
    metrics.requestCount++;
  });

  // ---- POST /conversations ----
  app.post('/conversations', async (req: FastifyRequest, reply: FastifyReply) => {
    const traceId = getTraceId(req);
    try {
      const body = (req.body ?? {}) as Record<string, unknown>;
      const metadata = body['metadata'] as Record<string, unknown> | undefined;

      req.log.info({ traceId }, 'Creating conversation');
      const conversation = await foundryClient.createConversation(metadata);
      metrics.conversationsCreated++;
      req.log.info({ traceId, conversationId: conversation.id }, 'Conversation created');
      await reply.status(201).send(conversation);
    } catch (err: unknown) {
      req.log.error({ err, traceId }, 'Failed to create conversation');
      errorReply(reply, 500, 'internal_error', 'Failed to create conversation');
    }
  });

  // ---- GET /conversations ----
  app.get('/conversations', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = req.query as Record<string, string | undefined>;
      const offset = query['offset'] !== undefined ? parseInt(query['offset'], 10) : undefined;
      const limit = query['limit'] !== undefined ? parseInt(query['limit'], 10) : undefined;

      const list = await foundryClient.listConversations(offset, limit);
      await reply.send(list);
    } catch (err: unknown) {
      req.log.error({ err }, 'Failed to list conversations');
      errorReply(reply, 500, 'internal_error', 'Failed to list conversations');
    }
  });

  // ---- GET /conversations/:conversationId ----
  app.get('/conversations/:conversationId', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = req.params as { conversationId: string };

      if (!isValidId(conversationId)) {
        errorReply(reply, 400, 'bad_request', 'Invalid conversation ID format');
        return;
      }

      const detail = await foundryClient.getConversation(conversationId);
      if (!detail) {
        errorReply(reply, 404, 'not_found', `Conversation ${conversationId} not found`);
        return;
      }

      await reply.send(detail);
    } catch (err: unknown) {
      req.log.error({ err }, 'Failed to get conversation');
      errorReply(reply, 500, 'internal_error', 'Failed to get conversation');
    }
  });

  // ---- POST /conversations/:conversationId/messages ----
  app.post('/conversations/:conversationId/messages', async (req: FastifyRequest, reply: FastifyReply) => {
    const { conversationId } = req.params as { conversationId: string };
    const traceId = getTraceId(req);

    if (!isValidId(conversationId)) {
      errorReply(reply, 400, 'bad_request', 'Invalid conversation ID format');
      return;
    }

    const body = req.body as Record<string, unknown> | null;
    const content = body?.['content'];
    if (typeof content !== 'string' || content.length === 0) {
      errorReply(reply, 400, 'bad_request', 'Missing required field: content');
      return;
    }

    const acceptHeader = req.headers['accept'] ?? '';
    const wantsStream = acceptHeader.includes('text/event-stream');

    if (wantsStream) {
      // SSE streaming
      try {
        req.log.info({ traceId, conversationId, mode: 'stream' }, 'Sending message (stream)');
        void reply.hijack();
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        const stream = foundryClient.sendMessageStream(conversationId, content, (chunk) => {
          reply.raw.write(chunk);
        });
        await stream;

        metrics.messagesSent++;
        req.log.info({ traceId, conversationId, mode: 'stream' }, 'Stream completed');
        reply.raw.end();
      } catch (err: unknown) {
        req.log.error({ err, traceId, conversationId }, 'Streaming error');
        // If we already hijacked, try to send error as SSE
        try {
          reply.raw.write(
            `event: error\ndata: ${JSON.stringify({ code: 'agent_error', message: 'Streaming error' })}\n\n`
          );
        } catch {
          // Connection already closed
        }
        reply.raw.end();
      }
    } else {
      // JSON response
      try {
        req.log.info({ traceId, conversationId, mode: 'json' }, 'Sending message (JSON)');
        const startTime = Date.now();
        const message = await foundryClient.sendMessage(conversationId, content);
        if (!message) {
          errorReply(reply, 404, 'not_found', `Conversation ${conversationId} not found`);
          return;
        }
        metrics.messagesSent++;
        const durationMs = Date.now() - startTime;
        req.log.info(
          { traceId, conversationId, durationMs, hasResolution: !!message.resolution },
          'Message sent (JSON)'
        );
        await reply.send(message);
      } catch (err: unknown) {
        req.log.error({ err, traceId, conversationId }, 'Failed to send message');
        errorReply(reply, 500, 'internal_error', 'Failed to send message');
      }
    }
  });

  // ---- GET /health ----
  app.get('/health', { logLevel: 'silent' }, async (_req, reply) => {
    const health = await foundryClient.checkHealth();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    await reply.status(statusCode).send(health);
  });

  // ---- GET /metrics ----
  app.get('/metrics', async (_req, reply) => {
    const lines = [
      '# HELP agent_requests_total Total number of requests',
      '# TYPE agent_requests_total counter',
      `agent_requests_total ${metrics.requestCount}`,
      '',
      '# HELP agent_conversations_created_total Conversations created',
      '# TYPE agent_conversations_created_total counter',
      `agent_conversations_created_total ${metrics.conversationsCreated}`,
      '',
      '# HELP agent_messages_sent_total Messages sent',
      '# TYPE agent_messages_sent_total counter',
      `agent_messages_sent_total ${metrics.messagesSent}`,
      '',
      '# HELP agent_errors_total Total errors',
      '# TYPE agent_errors_total counter',
      `agent_errors_total ${metrics.errorsTotal}`,
      '',
      '# HELP agent_prompt_tokens_total Prompt tokens consumed',
      '# TYPE agent_prompt_tokens_total counter',
      `agent_prompt_tokens_total ${metrics.promptTokensTotal}`,
      '',
      '# HELP agent_completion_tokens_total Completion tokens consumed',
      '# TYPE agent_completion_tokens_total counter',
      `agent_completion_tokens_total ${metrics.completionTokensTotal}`,
      ''
    ];
    await reply.type('text/plain').send(lines.join('\n'));
  });

  // ---- GET /identity ----
  // Diagnostic endpoint — always attempts real credential validation regardless
  // of SKIP_AUTH. Works with any credential source that the runtime-selected
  // Azure credential can use.
  // supports: az CLI, managed identity, environment variables, etc.
  app.get('/identity', async (req, reply) => {
    try {
      const credential = createAzureCredential();
      const tokenResponse = await credential.getToken('https://management.azure.com/.default', {
        abortSignal: AbortSignal.timeout(5000)
      });
      if (!tokenResponse) {
        throw new Error('Failed to acquire Azure management token');
      }

      const claims = decodeJwtPayload(tokenResponse.token);
      await reply.send({
        authenticated: true,
        identity: {
          tenantId: claims['tid'] ?? null,
          objectId: claims['oid'] ?? null,
          displayName: claims['name'] ?? claims['appid'] ?? null,
          type: inferIdentityType(claims)
        }
      });
    } catch (err: unknown) {
      req.log.error({ err }, 'Failed to get identity');
      await reply.send({
        authenticated: false,
        reason: `Credential error: ${err instanceof Error ? err.message : String(err)}`
      });
    }
  });
}

/** Exported for testing — allows tests to read/reset metrics. */
export function getMetrics(): Readonly<Metrics> {
  return { ...metrics };
}

export function resetMetrics(): void {
  metrics.requestCount = 0;
  metrics.conversationsCreated = 0;
  metrics.messagesSent = 0;
  metrics.errorsTotal = 0;
  metrics.promptTokensTotal = 0;
  metrics.completionTokensTotal = 0;
}
