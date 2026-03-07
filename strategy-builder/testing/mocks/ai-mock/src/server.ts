/**
 * Unified AI mock — standalone server entry point.
 *
 * Starts a Fastify server that serves both the Foundry Agent CRUD API
 * and the OpenAI Responses API on a single port.
 *
 * Usage:
 *   node src/server.ts
 *   PORT=8100 node src/server.ts
 */

import Fastify from 'fastify';
import { registerRoutes } from './routes.ts';

const PORT = parseInt(process.env['PORT'] ?? '8100', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';

async function main(): Promise<void> {
  const app = Fastify({ logger: true });

  registerRoutes(app);

  const address = await app.listen({ port: PORT, host: HOST });
  app.log.info(`Unified AI mock listening at ${address}`);
}

void main();
