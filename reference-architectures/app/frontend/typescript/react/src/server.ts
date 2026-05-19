import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import fastifyStatic from '@fastify/static';
import fastifyHttpProxy from '@fastify/http-proxy';
import Fastify from 'fastify';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface Config {
  readonly host: string;
  readonly port: number;
  readonly apiBaseUrl: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    host: env.HOST ?? '0.0.0.0',
    port: Number.parseInt(env.PORT ?? '8080', 10),
    apiBaseUrl: (env.API_BASE_URL ?? 'http://api:4000').replace(/\/+$/, '')
  };
}

export async function buildApp(config: Config) {
  const app = Fastify({ logger: true });
  app.get('/health', async () => ({ status: 'healthy' }));
  await app.register(fastifyHttpProxy, {
    upstream: config.apiBaseUrl,
    prefix: '/api',
    rewritePrefix: ''
  });
  await app.register(fastifyStatic, {
    root: join(__dirname, '..', 'dist'),
    wildcard: false
  });
  app.setNotFoundHandler(async (_request, reply) => reply.sendFile('index.html'));
  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const config = loadConfig();
  const app = await buildApp(config);
  await app.listen({ host: config.host, port: config.port });
}
