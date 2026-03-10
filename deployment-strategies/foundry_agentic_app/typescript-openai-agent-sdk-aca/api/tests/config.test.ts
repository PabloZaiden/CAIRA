/**
 * Unit tests for config.ts
 */

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('throws if AGENT_SERVICE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow('AGENT_SERVICE_URL');
  });

  it('loads defaults with only AGENT_SERVICE_URL set', () => {
    const config = loadConfig({ AGENT_SERVICE_URL: 'http://localhost:3000' });
    expect(config.port).toBe(4000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.agentServiceUrl).toBe('http://localhost:3000');
    expect(config.agentTokenScope).toBeUndefined();
    expect(config.applicationInsightsConnectionString).toBeUndefined();
    expect(config.logLevel).toBe('debug');
    expect(config.skipAuth).toBe(false);
  });

  it('loads all custom values', () => {
    const config = loadConfig({
      AGENT_SERVICE_URL: 'http://agent:3000',
      PORT: '5000',
      HOST: '127.0.0.1',
      AGENT_TOKEN_SCOPE: 'api://my-app/.default',
      APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=test',
      LOG_LEVEL: 'debug',
      SKIP_AUTH: 'true'
    });
    expect(config.port).toBe(5000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.agentServiceUrl).toBe('http://agent:3000');
    expect(config.agentTokenScope).toBe('api://my-app/.default');
    expect(config.applicationInsightsConnectionString).toBe('InstrumentationKey=test');
    expect(config.logLevel).toBe('debug');
    expect(config.skipAuth).toBe(true);
  });

  it('strips trailing slashes from AGENT_SERVICE_URL', () => {
    const config = loadConfig({ AGENT_SERVICE_URL: 'http://localhost:3000///' });
    expect(config.agentServiceUrl).toBe('http://localhost:3000');
  });

  it('SKIP_AUTH is false for any value other than "true"', () => {
    expect(loadConfig({ AGENT_SERVICE_URL: 'http://x', SKIP_AUTH: 'false' }).skipAuth).toBe(false);
    expect(loadConfig({ AGENT_SERVICE_URL: 'http://x', SKIP_AUTH: '1' }).skipAuth).toBe(false);
    expect(loadConfig({ AGENT_SERVICE_URL: 'http://x', SKIP_AUTH: '' }).skipAuth).toBe(false);
  });
});
