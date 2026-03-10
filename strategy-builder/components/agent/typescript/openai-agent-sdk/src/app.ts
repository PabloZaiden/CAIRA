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
import type { Config } from './config.ts';
import { registerRoutes } from './routes.ts';
import type { ErrorResponse } from './types.ts';
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
  // The agent container receives bearer tokens from the API container.
  // When SKIP_AUTH=true (local dev / tests), we skip validation entirely.
  if (!config.skipAuth) {
    app.addHook('onRequest', async (request, reply) => {
      const extracted = extractTraceContext(request.headers as Record<string, string | string[] | undefined>);
      void extracted;
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
      // TODO(WS-next): Implement JWT validation
      // Currently we only check that a bearer token is present. A proper
      // implementation should:
      //   1. Decode the JWT and validate expiry (`exp` claim)
      //   2. Verify the audience (`aud`) matches this service's app ID
      //   3. Verify the issuer (`iss`) is the expected Azure AD tenant
      //   4. Optionally validate the signature via JWKS endpoint
      // See: https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens
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
