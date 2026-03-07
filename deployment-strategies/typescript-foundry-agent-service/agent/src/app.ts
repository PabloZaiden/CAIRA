/**
 * Fastify application factory.
 *
 * Creates and configures the Fastify app with routes, auth hooks, and the
 * FoundryClient. Separated from server.ts so it can be used in tests without
 * starting a listener.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { FoundryClient } from './foundry-client.ts';
import type { Config } from './config.ts';
import { registerRoutes } from './routes.ts';
import type { ErrorResponse } from './types.ts';

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  // ---- Auth hook ----
  // The agent container receives bearer tokens from the API container.
  // When SKIP_AUTH=true (local dev / tests), we skip validation entirely.
  if (!config.skipAuth) {
    app.addHook('onRequest', async (request, reply) => {
      // Health, metrics, and identity endpoints are public
      if (request.url === '/health' || request.url === '/metrics' || request.url === '/identity') {
        return;
      }

      const authHeader = request.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const body: ErrorResponse = {
          code: 'unauthorized',
          message: 'Missing or invalid Authorization header'
        };
        await reply.status(401).send(body);
      }
      // In production, we'd validate the JWT token here.
      // For now, we just check that a bearer token is present.
    });
  }

  // ---- Foundry Client ----
  const foundryClient = new FoundryClient({ config, logger: app.log });

  try {
    await foundryClient.initialise();
  } catch (err) {
    app.log.warn({ err }, 'Failed to initialise FoundryClient — starting in degraded mode');
  }

  // ---- Routes ----
  registerRoutes(app, foundryClient);

  return app;
}
