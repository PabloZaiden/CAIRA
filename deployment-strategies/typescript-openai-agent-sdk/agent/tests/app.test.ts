import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Config } from '../src/config.ts';

const initialise = vi.fn();
const checkHealth = vi.fn();

vi.mock('../src/openai-client.ts', () => ({
  OpenAIClient: vi.fn().mockImplementation(() => ({
    initialise,
    checkHealth
  }))
}));

const { buildApp } = await import('../src/app.ts');

const baseConfig: Config = {
  port: 3000,
  host: '127.0.0.1',
  azureEndpoint: 'https://example.openai.azure.com/',
  apiVersion: '2024-10-21',
  model: 'gpt-5.2-chat',
  agentName: 'test-agent',
  captainInstructions: 'captain',
  shantyInstructions: 'shanty',
  treasureInstructions: 'treasure',
  crewInstructions: 'crew',
  logLevel: 'fatal',
  skipAuth: true
};

describe('buildApp', () => {
  beforeEach(() => {
    initialise.mockReset();
    checkHealth.mockReset();
    process.env['AGENT_INIT_TIMEOUT_MS'] = '10';
    checkHealth.mockResolvedValue({
      status: 'degraded',
      checks: [{ name: 'azure-openai', status: 'unhealthy' }]
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
      checks: [{ name: 'azure-openai', status: 'unhealthy' }]
    });

    await app.close();
  });
});
