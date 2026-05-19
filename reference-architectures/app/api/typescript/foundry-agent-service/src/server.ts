import { DefaultAzureCredential } from '@azure/identity';
import Fastify from 'fastify';

interface AgentsClient {
  createThread(): Promise<{ id: string }>;
  createMessage(threadId: string, role: 'user', content: string): Promise<unknown>;
  createRun(threadId: string, assistantId: string): Promise<{ id: string; status?: string }>;
  getRun(threadId: string, runId: string): Promise<{ id: string; status?: string }>;
  listMessages(threadId: string): AsyncIterable<{ role?: string; content?: unknown }>;
}

interface ProjectClient {
  agents: AgentsClient;
}

export interface Config {
  readonly host: string;
  readonly port: number;
  readonly projectEndpoint: string;
  readonly agentId: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const projectEndpoint = env.AZURE_AI_PROJECT_ENDPOINT;
  const agentId = env.FOUNDRY_AGENT_ID;
  if (!projectEndpoint) {
    throw new Error('AZURE_AI_PROJECT_ENDPOINT is required.');
  }
  if (!agentId) {
    throw new Error('FOUNDRY_AGENT_ID is required.');
  }

  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number.parseInt(env.PORT ?? '4000', 10),
    projectEndpoint,
    agentId
  };
}

export function normalizeMessage(body: unknown): { message: string; conversationId: string } {
  const record = body && typeof body === 'object' ? (body as { message?: unknown; conversationId?: unknown }) : {};
  const message = typeof record.message === 'string' ? record.message.trim() : '';
  if (!message) {
    throw new Error('message is required.');
  }

  return {
    message,
    conversationId:
      typeof record.conversationId === 'string' && record.conversationId.trim()
        ? record.conversationId.trim()
        : crypto.randomUUID()
  };
}

async function createProjectClient(endpoint: string): Promise<ProjectClient> {
  const sdk = (await import('@azure/ai-projects')) as unknown as {
    AIProjectClient: new (endpoint: string, credential: DefaultAzureCredential) => ProjectClient;
  };
  return new sdk.AIProjectClient(endpoint, new DefaultAzureCredential());
}

async function waitForRun(client: AgentsClient, threadId: string, runId: string) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const run = await client.getRun(threadId, runId);
    if (run.status === 'completed') {
      return;
    }
    if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
      throw new Error(`Foundry agent run ended with status ${run.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('Foundry agent run timed out.');
}

async function readLatestAssistantMessage(client: AgentsClient, threadId: string): Promise<string> {
  for await (const message of client.listMessages(threadId)) {
    if (message.role !== 'assistant') {
      continue;
    }
    const content = Array.isArray(message.content) ? message.content : [message.content];
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) return String(part.text);
        return '';
      })
      .join('\n')
      .trim();
  }

  return '';
}

export async function buildApp(config: Config) {
  const project = await createProjectClient(config.projectEndpoint);
  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'healthy' }));

  app.post('/chat', async (request, reply) => {
    let chatRequest: ReturnType<typeof normalizeMessage>;
    try {
      chatRequest = normalizeMessage(request.body);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Invalid request.' });
    }

    const thread = await project.agents.createThread();
    await project.agents.createMessage(thread.id, 'user', chatRequest.message);
    const run = await project.agents.createRun(thread.id, config.agentId);
    await waitForRun(project.agents, thread.id, run.id);

    return {
      conversationId: chatRequest.conversationId,
      reply: await readLatestAssistantMessage(project.agents, thread.id),
      model: config.agentId
    };
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await buildApp(config);
  await app.listen({ host: config.host, port: config.port });
}
