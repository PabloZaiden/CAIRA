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

const DEFAULT_CLIENT_INITIALISATION_TIMEOUT_MS = 60_000;

function readClientInitialisationTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const rawValue = env['AGENT_INIT_TIMEOUT_MS']?.trim();
  if (!rawValue) {
    return DEFAULT_CLIENT_INITIALISATION_TIMEOUT_MS;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLIENT_INITIALISATION_TIMEOUT_MS;
}

async function initialiseFoundryClientWithTimeout(
  app: FastifyInstance,
  foundryClient: FoundryClient,
  timeoutMs = readClientInitialisationTimeoutMs()
): Promise<void> {
  let settled = false;
  let timedOut = false;

  const initialisePromise = foundryClient.initialise();
  void initialisePromise
    .then(() => {
      settled = true;
      if (timedOut) {
        app.log.info('FoundryClient finished initialising after startup timeout');
      }
    })
    .catch((err: unknown) => {
      settled = true;
      if (timedOut) {
        app.log.warn({ err }, 'FoundryClient initialisation is still failing in the background');
      }
    });

  try {
    await Promise.race([
      initialisePromise,
      new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`FoundryClient initialisation timed out after ${String(timeoutMs)}ms`));
        }, timeoutMs);
        timer.unref?.();
      })
    ]);
  } catch (err) {
    if (!settled) {
      timedOut = true;
    }
    app.log.warn({ err }, 'Failed to initialise FoundryClient — starting in degraded mode');
  }
}

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

  await initialiseFoundryClientWithTimeout(app, foundryClient);

  // ---- Routes ----
  registerRoutes(app, foundryClient);

  return app;
}
