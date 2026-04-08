import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../src/config.ts';
import type { IncomingTokenValidator } from '../src/auth.ts';

const initialise = vi.fn();
const checkHealth = vi.fn();
const createConversation = vi.fn();

vi.mock('../src/foundry-client.ts', () => ({
  FoundryClient: vi.fn().mockImplementation(() => ({
    initialise,
    checkHealth,
    createConversation
  }))
}));

const { buildApp } = await import('../src/app.ts');

const baseConfig: Config = {
  port: 3000,
  host: '127.0.0.1',
  azureEndpoint: 'https://example.services.ai.azure.com/api/projects/default-project',
  model: 'gpt-5.2-chat',
  agentName: 'test-agent',
  captainInstructions: 'captain',
  shantyInstructions: 'shanty',
  treasureInstructions: 'treasure',
  crewInstructions: 'crew',
  applicationInsightsConnectionString: undefined,
  logLevel: 'fatal',
  skipAuth: true,
  inboundAuthTenantId: undefined,
  inboundAuthAllowedAudiences: [],
  inboundAuthAllowedCallerAppIds: [],
  inboundAuthAuthorityHost: 'https://login.microsoftonline.com'
};

describe('buildApp', () => {
  beforeEach(() => {
    initialise.mockReset();
    initialise.mockResolvedValue(undefined);
    checkHealth.mockReset();
    createConversation.mockReset();
    createConversation.mockResolvedValue({
      id: 'conv-001',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z'
    });
    process.env['AGENT_INIT_TIMEOUT_MS'] = '10';
    checkHealth.mockResolvedValue({
      status: 'degraded',
      checks: [{ name: 'azure-ai-foundry', status: 'unhealthy' }]
    });
  });

  afterEach(() => {
    delete process.env['AGENT_INIT_TIMEOUT_MS'];
  });

  it('starts in degraded mode when client initialisation hangs', async () => {
    initialise.mockImplementation(() => new Promise(() => {}));

    const app = (await Promise.race([
      buildApp({ config: baseConfig }),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('buildApp timed out')), 500);
      })
    ])) as FastifyInstance;

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'degraded',
      checks: [{ name: 'azure-ai-foundry', status: 'unhealthy' }]
    });

    await app.close();
  });

  it('rejects protected requests without a bearer token when auth is enabled', async () => {
    const app = await buildApp({
      config: {
        ...baseConfig,
        skipAuth: false,
        inboundAuthTenantId: 'tenant-123',
        inboundAuthAllowedAudiences: ['api://caira-agent']
      },
      incomingTokenValidator: { validateAccessToken: vi.fn() }
    });

    const response = await app.inject({ method: 'POST', url: '/conversations' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'unauthorized',
      message: 'Missing or invalid Authorization header'
    });

    await app.close();
  });

  it('rejects invalid bearer tokens when auth is enabled', async () => {
    const incomingTokenValidator: IncomingTokenValidator = {
      validateAccessToken: vi.fn().mockRejectedValue(new Error('bad token'))
    };

    const app = await buildApp({
      config: {
        ...baseConfig,
        skipAuth: false,
        inboundAuthTenantId: 'tenant-123',
        inboundAuthAllowedAudiences: ['api://caira-agent']
      },
      incomingTokenValidator
    });

    const response = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: 'Bearer wrong-token' }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      code: 'unauthorized',
      message: 'Invalid or unauthorized bearer token'
    });

    await app.close();
  });

  it('allows valid bearer tokens when auth is enabled', async () => {
    const incomingTokenValidator: IncomingTokenValidator = {
      validateAccessToken: vi.fn().mockResolvedValue(undefined)
    };

    const app = await buildApp({
      config: {
        ...baseConfig,
        skipAuth: false,
        inboundAuthTenantId: 'tenant-123',
        inboundAuthAllowedAudiences: ['api://caira-agent']
      },
      incomingTokenValidator
    });

    const response = await app.inject({
      method: 'POST',
      url: '/conversations',
      headers: { authorization: 'Bearer valid-token' }
    });
    expect(response.statusCode).toBe(201);

    await app.close();
  });
});
