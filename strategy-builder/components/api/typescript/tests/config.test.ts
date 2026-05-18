/**
 * Unit tests for config.ts
 */

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  it('throws if AGENT_SERVICE_URL is missing', () => {
    expect(() => loadConfig({})).toThrow('AGENT_SERVICE_URL');
  });

  it('loads defaults when auth bypass is enabled', () => {
    const config = loadConfig({ AGENT_SERVICE_URL: 'http://localhost:3000', SKIP_AUTH: 'true' });
    expect(config.port).toBe(4000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.agentServiceUrl).toBe('http://localhost:3000');
    expect(config.agentTokenScope).toBeUndefined();
    expect(config.inboundAuthTenantId).toBeUndefined();
    expect(config.inboundAuthAllowedAudiences).toEqual([]);
    expect(config.inboundAuthAllowedCallerAppIds).toEqual([]);
    expect(config.inboundAuthAuthorityHost).toBe('https://login.microsoftonline.com');
    expect(config.applicationInsightsConnectionString).toBeUndefined();
    expect(config.logLevel).toBe('debug');
    expect(config.skipAuth).toBe(true);
  });

  it('loads all custom values', () => {
    const config = loadConfig({
      AGENT_SERVICE_URL: 'http://agent:3000',
      PORT: '5000',
      HOST: '127.0.0.1',
      AGENT_TOKEN_SCOPE: 'api://my-app/.default',
      INBOUND_AUTH_TENANT_ID: 'tenant-123',
      INBOUND_AUTH_ALLOWED_AUDIENCES: 'api://my-api/.default,api://my-api',
      INBOUND_AUTH_ALLOWED_CALLER_APP_IDS: 'bff-app-1,bff-app-2',
      INBOUND_AUTH_AUTHORITY_HOST: 'https://login.microsoftonline.us/',
      APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=test',
      LOG_LEVEL: 'debug',
      SKIP_AUTH: 'false'
    });
    expect(config.port).toBe(5000);
    expect(config.host).toBe('127.0.0.1');
    expect(config.agentServiceUrl).toBe('http://agent:3000');
    expect(config.agentTokenScope).toBe('api://my-app/.default');
    expect(config.inboundAuthTenantId).toBe('tenant-123');
    expect(config.inboundAuthAllowedAudiences).toEqual(['api://my-api/.default', 'api://my-api']);
    expect(config.inboundAuthAllowedCallerAppIds).toEqual(['bff-app-1', 'bff-app-2']);
    expect(config.inboundAuthAuthorityHost).toBe('https://login.microsoftonline.us');
    expect(config.applicationInsightsConnectionString).toBe('InstrumentationKey=test');
    expect(config.logLevel).toBe('debug');
    expect(config.skipAuth).toBe(false);
  });

  it('requires auth settings when auth bypass is disabled', () => {
    expect(() => loadConfig({ AGENT_SERVICE_URL: 'http://localhost:3000' })).toThrow('AGENT_TOKEN_SCOPE');
    expect(() =>
      loadConfig({
        AGENT_SERVICE_URL: 'http://localhost:3000',
        AGENT_TOKEN_SCOPE: 'api://agent/.default'
      })
    ).toThrow('INBOUND_AUTH_TENANT_ID');
    expect(() =>
      loadConfig({
        AGENT_SERVICE_URL: 'http://localhost:3000',
        AGENT_TOKEN_SCOPE: 'api://agent/.default',
        INBOUND_AUTH_TENANT_ID: 'tenant-123'
      })
    ).toThrow('INBOUND_AUTH_ALLOWED_AUDIENCES');
  });

  it('strips trailing slashes from AGENT_SERVICE_URL', () => {
    const config = loadConfig({ AGENT_SERVICE_URL: 'http://localhost:3000///', SKIP_AUTH: 'true' });
    expect(config.agentServiceUrl).toBe('http://localhost:3000');
  });

  it('SKIP_AUTH is false for any value other than "true"', () => {
    expect(() => loadConfig({ AGENT_SERVICE_URL: 'http://x', SKIP_AUTH: 'false' })).toThrow('AGENT_TOKEN_SCOPE');
    expect(() => loadConfig({ AGENT_SERVICE_URL: 'http://x', SKIP_AUTH: '1' })).toThrow('AGENT_TOKEN_SCOPE');
    expect(() => loadConfig({ AGENT_SERVICE_URL: 'http://x', SKIP_AUTH: '' })).toThrow('AGENT_TOKEN_SCOPE');
  });
});
