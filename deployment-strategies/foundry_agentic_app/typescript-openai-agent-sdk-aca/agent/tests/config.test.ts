/**
 * Tests for src/config.ts — environment variable loading and validation.
 */

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  const REQUIRED_ENV = {
    AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
    INBOUND_AUTH_TENANT_ID: 'tenant-123',
    INBOUND_AUTH_ALLOWED_AUDIENCES: 'api://caira-agent'
  };

  it('loads config with all defaults', () => {
    const config = loadConfig(REQUIRED_ENV);
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.azureEndpoint).toBe('https://test.openai.azure.com');
    expect(config.apiVersion).toBe('2025-03-01-preview');
    expect(config.model).toBe('gpt-5.2-chat');
    expect(config.agentName).toBe('CAIRA Account Team Agent');
    expect(config.captainInstructions).toContain('discrete specialist');
    expect(config.shantyInstructions).toContain('opportunity discovery');
    expect(config.treasureInstructions).toContain('account planning');
    expect(config.crewInstructions).toContain('account team staffing');
    expect(config.applicationInsightsConnectionString).toBeUndefined();
    expect(config.logLevel).toBe('info');
    expect(config.skipAuth).toBe(false);
    expect(config.inboundAuthTenantId).toBe('tenant-123');
    expect(config.inboundAuthAllowedAudiences).toEqual(['api://caira-agent']);
    expect(config.inboundAuthAllowedCallerAppIds).toEqual([]);
    expect(config.inboundAuthAuthorityHost).toBe('https://login.microsoftonline.com');
  });

  it('throws when AZURE_OPENAI_ENDPOINT is missing', () => {
    expect(() => loadConfig({})).toThrow('AZURE_OPENAI_ENDPOINT');
  });

  it('overrides all optional fields', () => {
    const config = loadConfig({
      ...REQUIRED_ENV,
      PORT: '8080',
      HOST: '127.0.0.1',
      AZURE_OPENAI_API_VERSION: '2024-12-01-preview',
      AGENT_MODEL: 'gpt-5.2-chat',
      AGENT_NAME: 'Test Agent',
      CAPTAIN_INSTRUCTIONS: 'Custom captain prompt.',
      SHANTY_INSTRUCTIONS: 'Custom shanty prompt.',
      TREASURE_INSTRUCTIONS: 'Custom treasure prompt.',
      CREW_INSTRUCTIONS: 'Custom crew prompt.',
      APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=test',
      LOG_LEVEL: 'debug',
      SKIP_AUTH: 'true',
      INBOUND_AUTH_ALLOWED_CALLER_APP_IDS: 'api-client-1,api-client-2',
      INBOUND_AUTH_AUTHORITY_HOST: 'https://login.microsoftonline.us/'
    });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.apiVersion).toBe('2024-12-01-preview');
    expect(config.model).toBe('gpt-5.2-chat');
    expect(config.agentName).toBe('Test Agent');
    expect(config.captainInstructions).toBe('Custom captain prompt.');
    expect(config.shantyInstructions).toBe('Custom shanty prompt.');
    expect(config.treasureInstructions).toBe('Custom treasure prompt.');
    expect(config.crewInstructions).toBe('Custom crew prompt.');
    expect(config.applicationInsightsConnectionString).toBe('InstrumentationKey=test');
    expect(config.logLevel).toBe('debug');
    expect(config.skipAuth).toBe(true);
    expect(config.inboundAuthAllowedCallerAppIds).toEqual(['api-client-1', 'api-client-2']);
    expect(config.inboundAuthAuthorityHost).toBe('https://login.microsoftonline.us');
  });

  it('strips trailing slashes from endpoint', () => {
    const config = loadConfig({
      ...REQUIRED_ENV,
      AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com/'
    });
    expect(config.azureEndpoint).toBe('https://test.openai.azure.com');
  });

  it('treats SKIP_AUTH as false for any non-"true" value', () => {
    expect(loadConfig({ ...REQUIRED_ENV, SKIP_AUTH: 'false' }).skipAuth).toBe(false);
    expect(loadConfig({ ...REQUIRED_ENV, SKIP_AUTH: '1' }).skipAuth).toBe(false);
    expect(loadConfig({ ...REQUIRED_ENV, SKIP_AUTH: '' }).skipAuth).toBe(false);
    expect(loadConfig(REQUIRED_ENV).skipAuth).toBe(false);
  });

  it('requires inbound auth settings when auth is enabled', () => {
    expect(() => loadConfig({ AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com' })).toThrow(
      'INBOUND_AUTH_TENANT_ID'
    );
    expect(() =>
      loadConfig({
        AZURE_OPENAI_ENDPOINT: 'https://test.openai.azure.com',
        INBOUND_AUTH_TENANT_ID: 'tenant-123'
      })
    ).toThrow('INBOUND_AUTH_ALLOWED_AUDIENCES');
  });
});
