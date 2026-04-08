/**
 * Fastify application factory.
 *
 * Creates and configures the Fastify app with all plugins and routes.
 * Separated from server.ts so it can be used in tests without starting a listener.
 *
 * Note: This API is not publicly accessible — it is only reachable from the BFF
 * (Backend for Frontend). No CORS configuration is needed.
 */

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { AgentClient } from './agent-client.ts';
import type { AgentClientOptions } from './agent-client.ts';
import { createIncomingTokenValidator, extractBearerToken } from './auth.ts';
import { createAzureCredential } from './azure-credential.ts';
import type { IncomingTokenValidator } from './auth.ts';
import type { Config } from './config.ts';
import { registerRoutes } from './routes.ts';
import { extractTraceContext, setupTelemetry } from './telemetry.ts';

export interface BuildAppOptions {
  /** Application config */
  readonly config: Config;
  /** Override agent client options (for testing) */
  readonly agentClientOptions?: Partial<AgentClientOptions> | undefined;
  /** Override inbound token validation (for testing) */
  readonly incomingTokenValidator?: IncomingTokenValidator | undefined;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;

  setupTelemetry('caira-api-typescript', config.applicationInsightsConnectionString);

  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

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
      if (path === '/health' || path === '/identity' || path === '/metrics') {
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

  // ---- Agent Client ----
  const agentClientOpts: AgentClientOptions = {
    baseUrl: config.agentServiceUrl,
    tokenScope: config.agentTokenScope,
    skipAuth: config.skipAuth,
    logger: app.log,
    ...options.agentClientOptions
  };

  // If not skipping auth and no custom getToken, use the runtime-appropriate Azure credential.
  if (!agentClientOpts.skipAuth && !agentClientOpts.getToken && agentClientOpts.tokenScope) {
    const credential = createAzureCredential();
    const scope = agentClientOpts.tokenScope;

    const clientWithToken: AgentClientOptions = {
      ...agentClientOpts,
      getToken: async () => {
        const tokenResponse = await credential.getToken(scope);
        if (!tokenResponse) {
          throw new Error(`Failed to acquire Azure access token for scope ${scope}`);
        }
        return tokenResponse.token;
      }
    };
    const agentClient = new AgentClient(clientWithToken);
    registerRoutes(app, agentClient);
  } else {
    const agentClient = new AgentClient(agentClientOpts);
    registerRoutes(app, agentClient);
  }

  return app;
}
