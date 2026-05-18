/**
 * Fastify application factory.
 *
 * Creates and configures the Fastify app with routes, auth hooks, and the
 * OpenAIClient. Separated from server.ts so it can be used in tests without
 * starting a listener.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { OpenAIClient } from './openai-client.ts';
import type { OpenAIClientOptions } from './openai-client.ts';
import { createIncomingTokenValidator, extractBearerToken } from './auth.ts';
import type { IncomingTokenValidator } from './auth.ts';
import type { Config } from './config.ts';
import { registerRoutes } from './routes.ts';
import { extractTraceContext, setupTelemetry } from './telemetry.ts';

const DEFAULT_CLIENT_INITIALISATION_TIMEOUT_MS = 60_000;

function readClientInitialisationTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const rawValue = env['AGENT_INIT_TIMEOUT_MS']?.trim();
  if (!rawValue) {
    return DEFAULT_CLIENT_INITIALISATION_TIMEOUT_MS;
  }

  const parsed = Number(rawValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CLIENT_INITIALISATION_TIMEOUT_MS;
}

async function initialiseOpenAIClientWithTimeout(
  app: FastifyInstance,
  openaiClient: OpenAIClient,
  timeoutMs = readClientInitialisationTimeoutMs()
): Promise<void> {
  let settled = false;
  let timedOut = false;

  const initialisePromise = openaiClient.initialise();
  void initialisePromise
    .then(() => {
      settled = true;
      if (timedOut) {
        app.log.info('OpenAIClient finished initialising after startup timeout');
      }
    })
    .catch((err: unknown) => {
      settled = true;
      if (timedOut) {
        app.log.warn({ err }, 'OpenAIClient initialisation is still failing in the background');
      }
    });

  try {
    await Promise.race([
      initialisePromise,
      new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`OpenAIClient initialisation timed out after ${String(timeoutMs)}ms`));
        }, timeoutMs);
        timer.unref?.();
      })
    ]);
  } catch (err) {
    if (!settled) {
      timedOut = true;
    }
    app.log.warn({ err }, 'Failed to initialise OpenAIClient — starting in degraded mode');
  }
}

export interface BuildAppOptions {
  /** Application config */
  readonly config: Config;
  /** Override OpenAIClient options (for testing) */
  readonly openaiClientOptions?: Partial<OpenAIClientOptions> | undefined;
  /** Override inbound token validation (for testing) */
  readonly incomingTokenValidator?: IncomingTokenValidator | undefined;
  /** Skip OpenAIClient initialisation (for testing — caller must inject a ready client) */
  readonly skipInit?: boolean | undefined;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;

  setupTelemetry('caira-agent-openai', config.applicationInsightsConnectionString);

  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  // ---- Auth hook ----
  if (!config.skipAuth) {
    const incomingTokenValidator =
      options.incomingTokenValidator ??
      createIncomingTokenValidator({
        tenantId: config.inboundAuthTenantId ?? '',
        authorityHost: config.inboundAuthAuthorityHost,
        allowedAudiences: config.inboundAuthAllowedAudiences,
        allowedCallerAppIds: config.inboundAuthAllowedCallerAppIds
      });

    app.addHook('onRequest', async (request, reply) => {
      const extracted = extractTraceContext(request.headers as Record<string, string | string[] | undefined>);
      void extracted;
      const path = request.url.split('?', 1)[0];
      if (path === '/health' || path === '/metrics' || path === '/identity') {
        return;
      }

      const bearerToken = extractBearerToken(request.headers['authorization']);
      if (!bearerToken) {
        return reply.status(401).send({
          code: 'unauthorized',
          message: 'Missing or invalid Authorization header'
        });
      }

      try {
        await incomingTokenValidator.validateAccessToken(bearerToken);
      } catch {
        return reply.status(401).send({
          code: 'unauthorized',
          message: 'Invalid or unauthorized bearer token'
        });
      }
    });
  }

  // ---- OpenAI Client ----
  const openaiClientOpts: OpenAIClientOptions = {
    config,
    logger: app.log,
    ...options.openaiClientOptions
  };
  const openaiClient = new OpenAIClient(openaiClientOpts);

  if (!options.skipInit) {
    await initialiseOpenAIClientWithTimeout(app, openaiClient);
  }

  // ---- Routes ----
  registerRoutes(app, openaiClient);

  return app;
}
