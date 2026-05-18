/**
 * Az Credential Sidecar — serves Azure CLI tokens to containers via HTTP.
 *
 * Uses `@azure/identity`'s `AzureCliCredential` which shells out to `az account get-access-token`.
 *
 * Routes:
 *   GET  /token?resource=<scope>   — acquire token (query param)
 *   POST /token                    — acquire token (form body: resource=<scope>)
 *   GET  /health                   — health check
 *
 * Environment:
 *   PORT               — listen port (default: 8079)
 *   AZURE_CONFIG_DIR   — Azure CLI config directory (default: /app/.azure)
 */

import Fastify from 'fastify';
import { AzureCliCredential } from '@azure/identity';

// ─── Configuration ──────────────────────────────────────────────────────

const PORT = Number(process.env['PORT'] ?? '8079');
const HOST = process.env['HOST'] ?? '0.0.0.0';

// ─── Credential ─────────────────────────────────────────────────────────

const credential = new AzureCliCredential();

// ─── Token response type ────────────────────────────────────────────────

interface TokenResponse {
  access_token: string;
  expires_on: number;
  expiresOn: string;
  tokenType: string;
  resource: string;
}

// ─── Token acquisition ──────────────────────────────────────────────────

async function acquireToken(resource: string): Promise<TokenResponse> {
  // AzureCliCredential.getToken expects an array of scopes.
  // The resource URL from ManagedIdentityCredential is typically
  // "https://management.azure.com" — we append "/.default" if needed.
  const scope = resource.endsWith('/.default') ? resource : `${resource}/.default`;

  const tokenResponse = await credential.getToken(scope);

  // expiresOnTimestamp is milliseconds since epoch
  const expiresOnMs = tokenResponse.expiresOnTimestamp;
  const expiresOnDate = new Date(expiresOnMs);

  return {
    access_token: tokenResponse.token,
    expires_on: Math.floor(expiresOnMs / 1000),
    expiresOn: expiresOnDate.toISOString(),
    tokenType: 'Bearer',
    resource
  };
}

// ─── Server ─────────────────────────────────────────────────────────────

export async function buildServer() {
  const server = Fastify({ logger: false });

  // GET /token?resource=<scope>
  server.get<{ Querystring: { resource?: string } }>('/token', async (request, reply) => {
    const resource = request.query.resource;

    if (!resource) {
      return reply.status(400).send({ error: 'Missing required query parameter: resource' });
    }

    try {
      const token = await acquireToken(resource);
      return reply.send(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Token acquisition failed: ${message}` });
    }
  });

  // POST /token (form body: resource=<scope>)
  server.post('/token', async (request, reply) => {
    // Parse form body or JSON body
    let resource: string | undefined;

    if (typeof request.body === 'string') {
      // URL-encoded form body: resource=https://management.azure.com
      const params = new URLSearchParams(request.body);
      resource = params.get('resource') ?? undefined;
    } else if (request.body && typeof request.body === 'object') {
      resource = (request.body as Record<string, unknown>)['resource'] as string | undefined;
    }

    if (!resource) {
      return reply.status(400).send({ error: 'Missing required field: resource' });
    }

    try {
      const token = await acquireToken(resource);
      return reply.send(token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.status(500).send({ error: `Token acquisition failed: ${message}` });
    }
  });

  // GET /health
  server.get('/health', async (_request, reply) => {
    return reply.send({ status: 'ok' });
  });

  // Register content type parser for form-urlencoded bodies
  server.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body);
  });

  return server;
}

// ─── Entrypoint ─────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const server = await buildServer();

  try {
    await server.listen({ port: PORT, host: HOST });
    process.stdout.write(`Az credential sidecar listening on http://${HOST}:${PORT}\n`);
  } catch (err) {
    process.stderr.write(`Failed to start server: ${err}\n`);
    process.exit(1);
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}` || import.meta.filename === process.argv[1];

if (isMain) {
  main().catch((err: unknown) => {
    process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
