/**
 * Agent container — standalone server entry point.
 *
 * Starts the OpenAI Agent SDK container on the configured port.
 * Handles graceful shutdown on SIGTERM/SIGINT.
 *
 * Usage:
 *   node src/server.ts
 *   AZURE_OPENAI_ENDPOINT=https://... node src/server.ts
 */

import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';
import { shutdownTelemetry } from './telemetry.ts';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  const address = await app.listen({ port: config.port, host: config.host });
  app.log.info(`OpenAI Agent SDK container listening at ${address}`);
}

void main();
