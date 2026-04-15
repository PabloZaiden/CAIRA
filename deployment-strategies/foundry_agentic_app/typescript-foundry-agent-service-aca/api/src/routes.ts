/**
 * Fastify route definitions for the fictional sales/account-team sample API.
 *
 * Maps business endpoints to agent container operations:
 *   POST /api/activities/discovery              -> create conv + send synthetic first msg
 *   POST /api/activities/planning            -> create conv + send synthetic first msg
 *   POST /api/activities/staffing                -> create conv + send synthetic first msg
 *   GET  /api/activities/adventures          -> GET  /conversations (enriched)
 *   GET  /api/activities/adventures/:id      -> GET  /conversations/:id (enriched)
 *   POST /api/activities/adventures/:id/parley -> POST /conversations/:id/messages (SSE parsed)
 *   GET  /api/activities/stats               -> computed from adventures
 *   GET  /health                         -> checks agent /health
 *   GET  /health/deep                    -> auth-required check of agent business endpoint
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AgentClient } from './agent-client.ts';
import { mapAgentStatus } from './agent-client.ts';
import { randomUUID } from 'node:crypto';
import { createAzureCredential } from './azure-credential.ts';
import type {
  Adventure,
  AdventureDetail,
  AdventureList,
  AdventureMode,
  AdventureOutcome,
  AdventureStarted,
  AdventureStatus,
  ActivityStats,
  ErrorResponse,
  HealthResponse,
  ParleyMessage,
  AgentConversation,
  AgentConversationDetail,
  AgentMessage
} from './types.ts';

// ---------- In-memory adventure state ----------

/**
 * Stores adventure metadata (mode, status, outcome) keyed by conversation ID.
 * In a real deployment this would be a database — here we use a simple Map.
 *
 * Exported for testing.
 */
export interface AdventureRecord {
  mode: AdventureMode;
  status: AdventureStatus;
  outcome?: AdventureOutcome | undefined;
}

export const adventureStore = new Map<string, AdventureRecord>();

/** Reset adventure store (for testing). */
export function resetAdventureStore(): void {
  adventureStore.clear();
}

// ---------- Synthetic first messages ----------

const SYNTHETIC_MESSAGES: Record<AdventureMode, string> = {
  discovery:
    'I am qualifying a new customer opportunity. Lead a short discovery conversation, ask targeted questions, and conclude with a concise qualification summary.',
  planning:
    'I need an account plan for an active customer. Guide me through priorities, risks, and next steps, then conclude with a concise planning summary.',
  staffing:
    'I need to staff an account team for a customer engagement. Interview me for the needed context and conclude with a clear staffing recommendation.'
};

// ---------- Helpers ----------

function conversationToAdventure(
  conv: AgentConversation,
  record: AdventureRecord | undefined,
  messageCount?: number | undefined
): Adventure {
  const mode = record?.mode ?? extractModeFromMetadata(conv.metadata);
  const status = record?.status ?? 'active';
  return {
    id: conv.id,
    mode,
    status,
    ...(record?.outcome ? { outcome: record.outcome } : {}),
    createdAt: conv.createdAt,
    lastParleyAt: conv.updatedAt,
    messageCount: messageCount ?? 0
  };
}

function agentMessageToParley(msg: AgentMessage): ParleyMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
    ...(msg.usage ? { usage: msg.usage } : {}),
    ...(msg.resolution ? { resolution: msg.resolution } : {})
  };
}

function conversationDetailToAdventureDetail(
  detail: AgentConversationDetail,
  record: AdventureRecord | undefined
): AdventureDetail {
  const mode = record?.mode ?? extractModeFromMetadata(detail.metadata);
  const status = record?.status ?? 'active';
  return {
    id: detail.id,
    mode,
    status,
    ...(record?.outcome ? { outcome: record.outcome } : {}),
    createdAt: detail.createdAt,
    lastParleyAt: detail.updatedAt,
    messageCount: detail.messages.length,
    parleys: detail.messages.map(agentMessageToParley)
  };
}

function extractModeFromMetadata(metadata: Record<string, unknown> | undefined): AdventureMode {
  const mode = metadata?.['mode'];
  if (mode === 'discovery' || mode === 'planning' || mode === 'staffing') return mode;
  return 'discovery'; // fallback
}

/**
 * Decode the payload section of a JWT token (base64url → JSON).
 * Does NOT verify the signature — this is a diagnostic endpoint.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) return {};
  const payload = parts[1] ?? '';
  // base64url → base64
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

function errorReply(reply: FastifyReply, status: number, code: string, message: string): void {
  const body: ErrorResponse = { code, message };
  void reply.status(status).send(body);
}

/**
 * Generate a trace ID for request correlation.
 * The API is where traces originate — each incoming request gets a UUID
 * that is forwarded to the agent container via x-trace-id header.
 */
function generateTraceId(): string {
  return randomUUID();
}

/**
 * Parse an SSE stream looking for `activity.resolved` events.
 * Writes all chunks to the raw response (passthrough) and captures
 * outcome data from any `activity.resolved` event.
 *
 * Returns the captured outcome (if any).
 */
async function pipeSSEAndCaptureOutcome(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  reply: FastifyReply
): Promise<AdventureOutcome | undefined> {
  const decoder = new TextDecoder();
  let captured: AdventureOutcome | undefined;
  let buffer = '';

  try {
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        const chunk = decoder.decode(result.value, { stream: !done });
        // Write through to client immediately
        reply.raw.write(chunk);

        // Parse SSE lines looking for activity.resolved
        buffer += chunk;
        const lines = buffer.split('\n');
        // Keep the last (potentially incomplete) line in the buffer
        buffer = lines.pop() ?? '';

        let eventType: string | undefined;
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim();
          } else if (line.startsWith('data: ') && eventType === 'activity.resolved') {
            try {
              const data = JSON.parse(line.slice(6)) as {
                tool: string;
                result: Record<string, unknown>;
              };
              captured = { tool: data.tool, result: data.result };
            } catch {
              // Malformed JSON — skip
            }
            eventType = undefined;
          } else if (line === '') {
            // Empty line signals end of SSE event
            eventType = undefined;
          }
        }
      }
    }
  } catch {
    // Connection dropped — send error event
    reply.raw.write(
      'event: error\ndata: {"code":"agent_connection_lost","message":"Connection to agent was interrupted"}\n\n'
    );
  }

  return captured;
}

// ---------- Route registration ----------

export function registerRoutes(app: FastifyInstance, agentClient: AgentClient): void {
  // ---- Health ----
  app.get('/health', { logLevel: 'silent' }, async (_req, reply) => {
    const start = Date.now();
    const result = await agentClient.checkHealth();
    const latencyMs = Date.now() - start;

    const agentStatus = result.ok ? 'healthy' : 'unhealthy';
    const overallStatus = result.ok ? 'healthy' : 'degraded';

    const health: HealthResponse = {
      status: overallStatus,
      dependencies: [
        {
          name: 'agent-container',
          status: agentStatus,
          latencyMs
        }
      ]
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    await reply.status(statusCode).send(health);
  });

  app.get('/health/deep', { logLevel: 'silent' }, async (_req, reply) => {
    const start = Date.now();
    const result = await agentClient.listConversations(0, 1);
    const latencyMs = Date.now() - start;

    const agentStatus = result.ok ? 'healthy' : 'unhealthy';
    const overallStatus = result.ok ? 'healthy' : 'degraded';

    const health: HealthResponse = {
      status: overallStatus,
      dependencies: [
        {
          name: 'agent-container-auth',
          status: agentStatus,
          latencyMs
        }
      ]
    };

    const statusCode = overallStatus === 'healthy' ? 200 : 503;
    await reply.status(statusCode).send(health);
  });

  // ---- Business operation: start adventure ----

  async function handleStartAdventure(mode: AdventureMode, req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const traceId = generateTraceId();
    const syntheticMessage = SYNTHETIC_MESSAGES[mode];
    const metadata = { mode };

    req.log.info({ traceId, mode }, 'startAdventure request');

    // Only create the conversation — do NOT send the first message.
    // The frontend will send syntheticMessage via the streaming parley endpoint.
    const start = Date.now();
    const createResult = await agentClient.createConversation(metadata, traceId);
    const durationMs = Date.now() - start;

    if (!createResult.ok || !createResult.data) {
      const status = mapAgentStatus(createResult.status);
      req.log.error(
        { traceId, mode, statusCode: status, durationMs, errorCode: createResult.error?.code },
        'startAdventure failed'
      );
      errorReply(
        reply,
        status,
        createResult.error?.code ?? 'agent_error',
        createResult.error?.message ?? 'Failed to start adventure'
      );
      return;
    }

    const { id: conversationId, createdAt } = createResult.data;

    // Store adventure state
    const record: AdventureRecord = { mode, status: 'active' };
    adventureStore.set(conversationId, record);

    req.log.info({ traceId, mode, conversationId, durationMs }, 'startAdventure complete');

    const response: AdventureStarted = {
      id: conversationId,
      mode,
      status: record.status,
      syntheticMessage,
      createdAt
    };

    await reply.status(201).send(response);
  }

  // POST /api/activities/discovery
  app.post('/api/activities/discovery', async (req, reply) => {
    await handleStartAdventure('discovery', req, reply);
  });

  // POST /api/activities/planning
  app.post('/api/activities/planning', async (req, reply) => {
    await handleStartAdventure('planning', req, reply);
  });

  // POST /api/activities/staffing
  app.post('/api/activities/staffing', async (req, reply) => {
    await handleStartAdventure('staffing', req, reply);
  });

  // ---- GET /api/activities/adventures ----
  app.get('/api/activities/adventures', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const offset = query['offset'] !== undefined ? parseInt(query['offset'], 10) : undefined;
    const limit = query['limit'] !== undefined ? parseInt(query['limit'], 10) : undefined;

    const result = await agentClient.listConversations(offset, limit);
    if (!result.ok || !result.data) {
      const status = mapAgentStatus(result.status);
      errorReply(
        reply,
        status,
        result.error?.code ?? 'agent_error',
        result.error?.message ?? 'Failed to list adventures'
      );
      return;
    }

    const adventures = result.data.items.map((c) => conversationToAdventure(c, adventureStore.get(c.id)));

    const list: AdventureList = {
      adventures,
      offset: result.data.offset,
      limit: result.data.limit,
      total: result.data.total
    };

    await reply.send(list);
  });

  // ---- GET /api/activities/adventures/:adventureId ----
  app.get('/api/activities/adventures/:adventureId', async (req, reply) => {
    const { adventureId } = req.params as { adventureId: string };

    const result = await agentClient.getConversation(adventureId);
    if (!result.ok || !result.data) {
      const status = mapAgentStatus(result.status);
      errorReply(
        reply,
        status,
        result.error?.code ?? 'agent_error',
        result.error?.message ?? 'Failed to get adventure'
      );
      return;
    }

    const detail = conversationDetailToAdventureDetail(result.data, adventureStore.get(adventureId));
    await reply.send(detail);
  });

  // ---- POST /api/activities/adventures/:adventureId/parley ----
  app.post('/api/activities/adventures/:adventureId/parley', async (req: FastifyRequest, reply: FastifyReply) => {
    const { adventureId } = req.params as { adventureId: string };
    const body = req.body as Record<string, unknown> | null;
    const traceId = generateTraceId();

    const message = body?.['message'];
    if (typeof message !== 'string' || message.length === 0) {
      errorReply(reply, 400, 'bad_request', 'Missing required field: message');
      return;
    }

    const acceptHeader = req.headers['accept'] ?? '';
    const wantsStream = acceptHeader.includes('text/event-stream');

    req.log.info(
      {
        traceId,
        adventureId,
        mode: wantsStream ? 'stream' : 'json',
        contentLength: message.length
      },
      'parley request'
    );
    const start = Date.now();

    if (wantsStream) {
      // SSE streaming with outcome capture
      try {
        const agentResp = await agentClient.sendMessageStream(adventureId, message, undefined, traceId);

        if (!agentResp.ok) {
          // Agent returned an error — forward it
          let errorBody: { code?: string; message?: string; error?: { code?: string; message?: string } } | undefined;
          try {
            errorBody = (await agentResp.json()) as {
              code?: string;
              message?: string;
              error?: { code?: string; message?: string };
            };
          } catch {
            // Not JSON
          }
          const status = mapAgentStatus(agentResp.status);
          req.log.error(
            { traceId, adventureId, statusCode: status, durationMs: Date.now() - start },
            'parley SSE failed — agent error'
          );
          errorReply(
            reply,
            status,
            errorBody?.error?.code ?? errorBody?.code ?? 'agent_error',
            errorBody?.error?.message ?? errorBody?.message ?? `Agent returned status ${String(agentResp.status)}`
          );
          return;
        }

        if (!agentResp.body) {
          req.log.error({ traceId, adventureId }, 'parley SSE failed — no response body');
          errorReply(reply, 502, 'agent_error', 'Agent returned no response body for SSE stream');
          return;
        }

        // Hijack the response and pipe SSE events through while capturing outcomes
        void reply.hijack();

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        const reader = agentResp.body.getReader();
        const outcome = await pipeSSEAndCaptureOutcome(reader, reply);

        // If we captured a resolution, update adventure state
        if (outcome) {
          const record = adventureStore.get(adventureId);
          if (record) {
            record.status = 'resolved';
            record.outcome = outcome;
          }
        }

        req.log.info(
          { traceId, adventureId, durationMs: Date.now() - start, resolved: !!outcome },
          'parley SSE complete'
        );

        reply.raw.end();
      } catch (err) {
        req.log.error(
          { traceId, adventureId, error: err instanceof Error ? err.message : String(err) },
          'parley SSE failed — connection error'
        );
        errorReply(reply, 502, 'agent_unreachable', 'Failed to connect to agent container for streaming');
      }
    } else {
      // JSON response
      const result = await agentClient.sendMessage(adventureId, message, traceId);
      if (!result.ok || !result.data) {
        const status = mapAgentStatus(result.status);
        req.log.error(
          { traceId, adventureId, statusCode: status, durationMs: Date.now() - start },
          'parley JSON failed'
        );
        errorReply(
          reply,
          status,
          result.error?.code ?? 'agent_error',
          result.error?.message ?? 'Failed to send message'
        );
        return;
      }

      // Check for resolution in JSON response
      if (result.data.resolution) {
        const record = adventureStore.get(adventureId);
        if (record) {
          record.status = 'resolved';
          record.outcome = result.data.resolution;
        }
      }

      req.log.info(
        {
          traceId,
          adventureId,
          durationMs: Date.now() - start,
          resolved: !!result.data.resolution,
          contentLength: result.data.content.length
        },
        'parley JSON complete'
      );

      const parley: ParleyMessage = agentMessageToParley(result.data);
      await reply.send(parley);
    }
  });

  // ---- GET /api/activities/stats ----
  app.get('/api/activities/stats', async (_req, reply) => {
    // Get all conversations to compute stats
    const result = await agentClient.listConversations(0, 100);
    if (!result.ok || !result.data) {
      const status = mapAgentStatus(result.status);
      errorReply(
        reply,
        status,
        result.error?.code ?? 'agent_error',
        result.error?.message ?? 'Failed to get adventure stats'
      );
      return;
    }

    const modeInit = () => ({ total: 0, active: 0, resolved: 0 });
    const counts = {
      discovery: modeInit(),
      planning: modeInit(),
      staffing: modeInit()
    };

    let totalAdventures = 0;
    let activeAdventures = 0;
    let resolvedAdventures = 0;

    for (const conv of result.data.items) {
      const record = adventureStore.get(conv.id);
      const mode = record?.mode ?? extractModeFromMetadata(conv.metadata);
      const status = record?.status ?? 'active';

      totalAdventures++;
      const modeStats = counts[mode];

      modeStats.total++;
      if (status === 'resolved') {
        resolvedAdventures++;
        modeStats.resolved++;
      } else {
        activeAdventures++;
        modeStats.active++;
      }
    }

    const stats: ActivityStats = {
      totalAdventures,
      activeAdventures,
      resolvedAdventures,
      byMode: counts
    };

    await reply.send(stats);
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
