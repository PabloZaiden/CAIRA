/**
 * Agent container — standalone server entry point.
 *
 * Starts the Azure AI Foundry Agent Service container on the configured port.
 * Handles graceful shutdown on SIGTERM/SIGINT.
 *
 * Usage:
 *   node src/server.ts
 *   AZURE_AI_PROJECT_ENDPOINT=https://... node src/server.ts
 */

import { loadConfig } from './config.ts';
import { buildApp } from './app.ts';
import { shutdownAzureMonitor } from '@azure/monitor-opentelemetry';
import process from 'process';

async function main(): Promise<void> {
  process.env['AZURE_TRACIING_GEN_AI_CONTENT_RECORDING_ENABLED'] = 'true';

  const config = loadConfig();
  const app = await buildApp(config);

  // Graceful shutdown
  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    await shutdownAzureMonitor();
    await app.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  const address = await app.listen({ port: config.port, host: config.host });
  app.log.info(`Foundry Agent Service container listening at ${address}`);
}

void main();
