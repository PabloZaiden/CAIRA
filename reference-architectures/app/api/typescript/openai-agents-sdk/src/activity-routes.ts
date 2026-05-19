import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  ActivityResolution,
  Conversation,
  ConversationDetail,
  ConversationList,
  HealthResponse,
  Message
} from './types.ts';

type ActivityMode = 'discovery' | 'planning' | 'staffing';
type ActivityStatus = 'active' | 'resolved';

interface AgentRuntime {
  createConversation(metadata?: Record<string, unknown>): Promise<Conversation>;
  listConversations(offset?: number, limit?: number): Promise<ConversationList>;
  getConversation(conversationId: string): Promise<ConversationDetail | undefined>;
  sendMessage(conversationId: string, content: string): Promise<Message | undefined>;
  sendMessageStream(conversationId: string, content: string, onChunk: (chunk: string) => void): Promise<void>;
  checkHealth(): Promise<HealthResponse>;
}

interface ActivityRecord {
  mode: ActivityMode;
  status: ActivityStatus;
  outcome?: ActivityResolution;
}

const store = new Map<string, ActivityRecord>();

const syntheticMessages: Record<ActivityMode, string> = {
  discovery:
    'I am qualifying a new customer opportunity. Lead a short discovery conversation, ask targeted questions, and conclude with a concise qualification summary.',
  planning:
    'I need an account plan for an active customer. Guide me through priorities, risks, and next steps, then conclude with a concise planning summary.',
  staffing:
    'I need to staff an account team for a customer engagement. Interview me for the needed context and conclude with a clear staffing recommendation.'
};

function errorReply(reply: FastifyReply, status: number, code: string, message: string): void {
  void reply.status(status).send({ code, message });
}

function modeFrom(metadata: Record<string, unknown> | undefined): ActivityMode {
  const mode = metadata?.['mode'];
  return mode === 'planning' || mode === 'staffing' || mode === 'discovery' ? mode : 'discovery';
}

function activityConversation(conversation: Conversation) {
  const record = store.get(conversation.id);
  return {
    id: conversation.id,
    mode: record?.mode ?? modeFrom(conversation.metadata),
    status: record?.status ?? 'active',
    ...(record?.outcome ? { outcome: record.outcome } : {}),
    createdAt: conversation.createdAt,
    lastMessageAt: conversation.updatedAt,
    messageCount: 0
  };
}

function activityDetail(detail: ConversationDetail) {
  const record = store.get(detail.id);
  return {
    ...activityConversation(detail),
    messageCount: detail.messages.length,
    messages: detail.messages
  };
}

function markResolved(conversationId: string, outcome: ActivityResolution | undefined): void {
  if (!outcome) return;
  const record = store.get(conversationId);
  if (record) {
    record.status = 'resolved';
    record.outcome = outcome;
  }
}

function captureResolvedEvent(chunk: string): ActivityResolution | undefined {
  const eventIndex = chunk.indexOf('event: activity.resolved');
  if (eventIndex < 0) return undefined;
  const dataLine = chunk.slice(eventIndex).split(/\r?\n/).find((line) => line.startsWith('data: '));
  if (!dataLine) return undefined;
  return JSON.parse(dataLine.slice('data: '.length)) as ActivityResolution;
}

export function registerActivityRoutes(app: FastifyInstance, runtime: AgentRuntime, modelName: string): void {
  async function start(mode: ActivityMode, req: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const conversation = await runtime.createConversation({ mode });
      store.set(conversation.id, { mode, status: 'active' });
      await reply.status(201).send({
        id: conversation.id,
        mode,
        status: 'active',
        syntheticMessage: syntheticMessages[mode],
        createdAt: conversation.createdAt
      });
    } catch (err) {
      req.log.error({ err, mode }, 'Failed to start activity conversation');
      errorReply(reply, 500, 'agent_error', 'Failed to start activity conversation');
    }
  }

  app.get('/health/deep', { logLevel: 'silent' }, async (_req, reply) => {
    const startTime = Date.now();
    const health = await runtime.checkHealth();
    const healthy = health.status === 'healthy';
    await reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'healthy' : 'degraded',
      dependencies: [{ name: 'agent-runtime', status: health.status, latencyMs: Date.now() - startTime }]
    });
  });

  app.post('/api/activities/discovery', async (req, reply) => start('discovery', req, reply));
  app.post('/api/activities/planning', async (req, reply) => start('planning', req, reply));
  app.post('/api/activities/staffing', async (req, reply) => start('staffing', req, reply));

  app.get('/api/activities/conversations', async (req, reply) => {
    const query = req.query as Record<string, string | undefined>;
    const offset = query['offset'] ? Number.parseInt(query['offset'], 10) : 0;
    const limit = query['limit'] ? Number.parseInt(query['limit'], 10) : 20;
    const list = await runtime.listConversations(offset, limit);
    await reply.send({
      conversations: list.items.map(activityConversation),
      offset: list.offset,
      limit: list.limit,
      total: list.total
    });
  });

  app.get('/api/activities/conversations/:conversationId', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const detail = await runtime.getConversation(conversationId);
    if (!detail) {
      errorReply(reply, 404, 'not_found', `Conversation ${conversationId} not found`);
      return;
    }
    await reply.send(activityDetail(detail));
  });

  app.post('/api/activities/conversations/:conversationId/messages', async (req, reply) => {
    const { conversationId } = req.params as { conversationId: string };
    const message = (req.body as { message?: unknown } | undefined)?.message;
    if (typeof message !== 'string' || message.length === 0) {
      errorReply(reply, 400, 'bad_request', 'Missing required field: message');
      return;
    }

    if (String(req.headers['accept'] ?? '').includes('text/event-stream')) {
      void reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });

      let captured: ActivityResolution | undefined;
      try {
        await runtime.sendMessageStream(conversationId, message, (chunk) => {
          captured ??= captureResolvedEvent(chunk);
          reply.raw.write(chunk);
        });
        markResolved(conversationId, captured);
      } catch (err) {
        req.log.error({ err, conversationId }, 'Failed to stream activity message');
        reply.raw.write(
          `event: error\ndata: ${JSON.stringify({ code: 'agent_error', message: 'Failed to stream message' })}\n\n`
        );
      } finally {
        reply.raw.end();
      }
      return;
    }

    const result = await runtime.sendMessage(conversationId, message);
    if (!result) {
      errorReply(reply, 404, 'not_found', `Conversation ${conversationId} not found`);
      return;
    }
    markResolved(conversationId, result.resolution);
    await reply.send(result);
  });

  app.get('/api/activities/stats', async (_req, reply) => {
    const list = await runtime.listConversations(0, 100);
    const byMode = {
      discovery: { total: 0, active: 0, resolved: 0 },
      planning: { total: 0, active: 0, resolved: 0 },
      staffing: { total: 0, active: 0, resolved: 0 }
    };
    for (const conversation of list.items) {
      const record = store.get(conversation.id);
      const mode = record?.mode ?? modeFrom(conversation.metadata);
      const status = record?.status ?? 'active';
      byMode[mode].total += 1;
      byMode[mode][status] += 1;
    }
    const resolvedConversations = byMode.discovery.resolved + byMode.planning.resolved + byMode.staffing.resolved;
    await reply.send({
      totalConversations: list.items.length,
      activeConversations: list.items.length - resolvedConversations,
      resolvedConversations,
      byMode
    });
  });

  app.post('/chat', async (req, reply) => {
    const body = req.body as { message?: unknown; conversationId?: unknown } | undefined;
    const message = body?.message;
    if (typeof message !== 'string' || message.length === 0) {
      errorReply(reply, 400, 'bad_request', 'Missing required field: message');
      return;
    }
    const conversationId =
      typeof body?.conversationId === 'string' && body.conversationId.length > 0
        ? body.conversationId
        : (await runtime.createConversation({ mode: 'discovery', chat: true })).id;
    const response = await runtime.sendMessage(conversationId, message);
    await reply.send({ conversationId, reply: response?.content ?? '', model: modelName });
  });
}
