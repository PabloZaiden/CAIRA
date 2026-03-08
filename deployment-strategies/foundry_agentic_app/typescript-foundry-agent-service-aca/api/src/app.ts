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
import { DefaultAzureCredential } from '@azure/identity';
import { AgentClient } from './agent-client.ts';
import type { AgentClientOptions } from './agent-client.ts';
import type { Config } from './config.ts';
import { registerRoutes } from './routes.ts';

export interface BuildAppOptions {
  /** Application config */
  readonly config: Config;
  /** Override agent client options (for testing) */
  readonly agentClientOptions?: Partial<AgentClientOptions> | undefined;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { config } = options;

  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  if (!config.skipAuth) {
    app.addHook('onRequest', async (request, reply) => {
      const path = request.url.split('?', 1)[0];
      if (path === '/health' || path === '/identity' || path === '/metrics') {
        return;
      }

      const authHeader = request.headers['authorization'];
      if (
        typeof authHeader !== 'string' ||
        !authHeader.startsWith('Bearer ') ||
        authHeader.length <= 'Bearer '.length
      ) {
        return reply.status(401).send({
          code: 'unauthorized',
          message: 'Missing or invalid Authorization header'
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

  // If not skipping auth and no custom getToken, use DefaultAzureCredential
  if (!agentClientOpts.skipAuth && !agentClientOpts.getToken && agentClientOpts.tokenScope) {
    const credential = new DefaultAzureCredential();
    const scope = agentClientOpts.tokenScope;

    const clientWithToken: AgentClientOptions = {
      ...agentClientOpts,
      getToken: async () => {
        const tokenResponse = await credential.getToken(scope);
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
