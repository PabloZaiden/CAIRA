/**
 * API container — standalone server entry point.
 *
 * Starts the pirate-themed business API on the configured port.
 * Handles graceful shutdown on SIGTERM/SIGINT.
 *
 * Usage:
 *   node src/server.ts
 *   AGENT_SERVICE_URL=http://localhost:3000 node src/server.ts
 */

import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  const address = await app.listen({ port: config.port, host: config.host });
  app.log.info(`Pirate API listening at ${address}`);
}

void main();
