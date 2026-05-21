/**
 * Frontend BFF (Backend for Frontend) server.
 *
 * Serves the built React SPA as static files and proxies `/api/*`
 * requests to the business API container. This replaces nginx entirely —
 * the frontend container is a Node.js Fastify app.
 *
 * Usage:
 *   node src/server.ts
 *   API_BASE_URL=http://api:4000 node src/server.ts
 */

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyHttpProxy from '@fastify/http-proxy';
import type { DependencyHealth, HealthResponse } from './types.ts';
import { injectTraceContext, setupTelemetry, shutdownTelemetry } from './telemetry.ts';
import { createAzureCredential } from './azure-credential.ts';

// ---- Configuration ----

export interface BffConfig {
  /** Server port (default 8080) */
  readonly port: number;
  /** Server bind address (default 0.0.0.0) */
  readonly host: string;
  /** Base URL of the business API container (default http://api:4000) */
  readonly apiBaseUrl: string;
  /** Pino log level (default info) */
  readonly logLevel: string;
  /** Application Insights connection string for Azure Monitor OTEL export */
  readonly applicationInsightsConnectionString?: string | undefined;
  /** Azure AD token scope for BFF -> API requests */
  readonly apiTokenScope?: string | undefined;
  /** Skip bearer token acquisition for local mock/dev flows */
  readonly skipAuth: boolean;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): BffConfig {
  const skipAuth = env['SKIP_AUTH'] === 'true';
  const apiTokenScope = env['API_TOKEN_SCOPE'];

  if (!skipAuth && !apiTokenScope) {
    throw new Error(
      'API_TOKEN_SCOPE environment variable is required when SKIP_AUTH is not true. ' +
        'Set it to the Entra application scope for the API container (for example, api://<api-app-id>/.default).'
    );
  }

  return {
    port: parseInt(env['PORT'] ?? '8080', 10),
    host: env['HOST'] ?? '0.0.0.0',
    apiBaseUrl: (env['API_BASE_URL'] ?? 'http://api:4000').replace(/\/+$/, ''),
    logLevel: env['LOG_LEVEL'] ?? 'debug',
    applicationInsightsConnectionString: env['APPLICATIONINSIGHTS_CONNECTION_STRING'],
    apiTokenScope,
    skipAuth
  };
}

// ---- App builder ----

export interface BuildBffOptions {
  readonly config: BffConfig;
  /** Absolute path to the directory containing built static files (default: ../dist) */
  readonly staticDir?: string | undefined;
  /** Override token acquisition for tests */
  readonly getAccessToken?: (() => Promise<string>) | undefined;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

interface ApiAuthProvider {
  getAuthorizationHeader(): Promise<string | undefined>;
}

class EntraApiAuthProvider implements ApiAuthProvider {
  private readonly credential = createAzureCredential();
  private readonly scope: string;
  private readonly getAccessTokenOverride: (() => Promise<string>) | undefined;
  private cachedToken: { token: string; expiresOnTimestamp: number } | undefined;

  constructor(scope: string, getAccessTokenOverride?: (() => Promise<string>) | undefined) {
    this.scope = scope;
    this.getAccessTokenOverride = getAccessTokenOverride;
  }

  async getAuthorizationHeader(): Promise<string> {
    if (this.getAccessTokenOverride) {
      const token = await this.getAccessTokenOverride();
      return `Bearer ${token}`;
    }

    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresOnTimestamp - TOKEN_REFRESH_BUFFER_MS > now) {
      return `Bearer ${this.cachedToken.token}`;
    }

    const accessToken = await this.credential.getToken(this.scope);
    if (!accessToken?.token) {
      throw new Error(`Failed to acquire an access token for scope ${this.scope}`);
    }

    this.cachedToken = {
      token: accessToken.token,
      expiresOnTimestamp: accessToken.expiresOnTimestamp
    };

    return `Bearer ${accessToken.token}`;
  }
}

function createApiAuthProvider(
  config: BffConfig,
  getAccessToken?: (() => Promise<string>) | undefined
): ApiAuthProvider {
  if (config.skipAuth) {
    return {
      getAuthorizationHeader: async () => undefined
    };
  }

  if (!config.apiTokenScope) {
    throw new Error('API_TOKEN_SCOPE must be configured when BFF auth is enabled.');
  }

  return new EntraApiAuthProvider(config.apiTokenScope, getAccessToken);
}

export async function buildApp(options: BuildBffOptions) {
  const { config } = options;
  const staticDir = options.staticDir ?? join(__dirname, '..', 'dist');
  const apiAuthProvider = createApiAuthProvider(config, options.getAccessToken);

  setupTelemetry('caira-frontend-bff', config.applicationInsightsConnectionString);

  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  // ---- Health check (registered before proxy to avoid proxying /health) ----
  app.get('/health', { logLevel: 'silent' }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ status: 'healthy' });
  });

  app.get('/health/deep', { logLevel: 'silent' }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();
    try {
      const authorization = await apiAuthProvider.getAuthorizationHeader();
      const response = await fetch(`${config.apiBaseUrl}/health/deep`, {
        method: 'GET',
        headers: injectTraceContext({
          Accept: 'application/json',
          ...(authorization ? { Authorization: authorization } : {})
        }),
        signal: AbortSignal.timeout(5_000)
      });

      const latencyMs = Date.now() - start;
      const apiHealth = (await response.json()) as HealthResponse;
      const apiDependency: DependencyHealth = {
        name: 'api-container-auth',
        status: response.ok ? 'healthy' : 'unhealthy',
        latencyMs
      };

      const mergedDependencies = [apiDependency, ...(apiHealth.dependencies ?? [])];
      const overallStatus = response.ok && apiHealth.status === 'healthy' ? 'healthy' : 'degraded';
      return reply.status(overallStatus === 'healthy' ? 200 : 503).send({
        status: overallStatus,
        dependencies: mergedDependencies
      } as HealthResponse);
    } catch {
      const latencyMs = Date.now() - start;
      return reply.status(503).send({
        status: 'degraded',
        dependencies: [
          {
            name: 'api-container-auth',
            status: 'unhealthy',
            latencyMs
          }
        ]
      } satisfies HealthResponse);
    }
  });

  app.addHook('onRequest', async (request) => {
    const path = request.url.split('?', 1)[0] ?? request.url;
    if (path === '/api' || path.startsWith('/api/')) {
      const authorization = await apiAuthProvider.getAuthorizationHeader();
      if (authorization) {
        (request.headers as Record<string, string>)['authorization'] = authorization;
      } else {
        delete (request.headers as Record<string, string | undefined>)['authorization'];
      }
      injectTraceContext(request.headers as Record<string, string>);
    }
  });

  // ---- API proxy ----
  // Proxies /api/* to the business API container with full SSE support.
  // The default @fastify/reply-from timeout is 10s which is too short for
  // LLM inference (especially with connected-agent orchestration that can
  // take 30s+). Setting a 60s timeout for non-streaming requests; the SSE
  // streams are handled separately below.
  await app.register(fastifyHttpProxy, {
    upstream: config.apiBaseUrl,
    prefix: '/api',
    rewritePrefix: '/api',
    http: {
      requestOptions: {
        timeout: 60_000
      }
    }
  });

  // ---- Static file serving ----
  // Serves the Vite-built React SPA. The SPA fallback ensures that
  // client-side routes (e.g., /conversations/123) serve index.html.
  await app.register(fastifyStatic, {
    root: staticDir,
    wildcard: false
  });

  // SPA fallback — any GET request that doesn't match a file or route
  // serves index.html so React Router can handle it client-side.
  app.setNotFoundHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    if (request.method === 'GET' || request.method === 'HEAD') {
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({ error: 'Not Found' });
  });

  return app;
}

// ---- Main ----

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
  app.log.info(`Frontend BFF listening at ${address}`);
  app.log.info(`Proxying /api/* → ${config.apiBaseUrl}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main();
}
