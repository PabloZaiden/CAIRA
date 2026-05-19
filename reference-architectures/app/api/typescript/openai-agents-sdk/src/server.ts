import { getBearerTokenProvider } from '@azure/identity';
import { Agent, run, setDefaultOpenAIClient, setTracingDisabled } from '@openai/agents';
import Fastify from 'fastify';
import { AzureOpenAI } from 'openai';

export interface Config {
  readonly host: string;
  readonly port: number;
  readonly azureOpenAIEndpoint: string;
  readonly azureOpenAIApiVersion: string;
  readonly model: string;
  readonly agentName: string;
  readonly instructions: string;
}

export interface ChatRequest {
  readonly message?: string;
  readonly conversationId?: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const azureOpenAIEndpoint = env.AZURE_OPENAI_ENDPOINT;
  if (!azureOpenAIEndpoint) {
    throw new Error('AZURE_OPENAI_ENDPOINT is required.');
  }

  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number.parseInt(env.PORT ?? '4000', 10),
    azureOpenAIEndpoint,
    azureOpenAIApiVersion: env.AZURE_OPENAI_API_VERSION ?? '2025-04-01-preview',
    model: env.AGENT_MODEL ?? 'gpt-5-mini',
    agentName: env.AGENT_NAME ?? 'CAIRA Reference Agent',
    instructions:
      env.AGENT_INSTRUCTIONS ??
      'You are a concise assistant. Answer the user directly and ask for missing details only when necessary.'
  };
}

export function normalizeChatRequest(body: unknown): { message: string; conversationId: string } {
  const value = body && typeof body === 'object' ? (body as ChatRequest) : {};
  const message = typeof value.message === 'string' ? value.message.trim() : '';
  if (!message) {
    throw new Error('message is required.');
  }

  return {
    message,
    conversationId:
      typeof value.conversationId === 'string' && value.conversationId.trim()
        ? value.conversationId.trim()
        : crypto.randomUUID()
  };
}

async function configureAzureOpenAI(config: Config): Promise<void> {
  const tokenProvider = getBearerTokenProvider(
    new (await import('@azure/identity')).DefaultAzureCredential(),
    'https://cognitiveservices.azure.com/.default'
  );

  const client = new AzureOpenAI({
    endpoint: config.azureOpenAIEndpoint,
    apiVersion: config.azureOpenAIApiVersion,
    azureADTokenProvider: tokenProvider
  });
  setDefaultOpenAIClient(client as unknown as Parameters<typeof setDefaultOpenAIClient>[0]);
  setTracingDisabled(true);
}

export async function buildApp(config: Config) {
  await configureAzureOpenAI(config);
  const agent = new Agent({
    name: config.agentName,
    model: config.model,
    instructions: config.instructions
  });

  const app = Fastify({ logger: true });

  app.get('/health', async () => ({ status: 'healthy' }));

  app.post('/chat', async (request, reply) => {
    let chatRequest: ReturnType<typeof normalizeChatRequest>;
    try {
      chatRequest = normalizeChatRequest(request.body);
    } catch (error) {
      return reply.status(400).send({ error: error instanceof Error ? error.message : 'Invalid request.' });
    }

    const result = await run(agent, chatRequest.message);
    const finalOutput = typeof result.finalOutput === 'string' ? result.finalOutput : String(result.finalOutput ?? '');

    return {
      conversationId: chatRequest.conversationId,
      reply: finalOutput,
      model: config.model
    };
  });

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await buildApp(config);
  await app.listen({ host: config.host, port: config.port });
}
