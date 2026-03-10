/**
 * Tests for src/config.ts — environment variable loading and validation.
 */

import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.ts';

describe('loadConfig', () => {
  const REQUIRED_ENV = {
    AZURE_AI_PROJECT_ENDPOINT: 'https://test.ai.azure.com'
  };

  it('loads config with all defaults', () => {
    const config = loadConfig(REQUIRED_ENV);
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.azureEndpoint).toBe('https://test.ai.azure.com');
    expect(config.model).toBe('gpt-5.2-chat');
    expect(config.agentName).toBe('caira-pirate-agent');
    expect(config.captainInstructions).toContain('discrete specialist');
    expect(config.shantyInstructions).toContain('shanty');
    expect(config.treasureInstructions).toContain('treasure');
    expect(config.crewInstructions).toContain('crew');
    expect(config.applicationInsightsConnectionString).toBeUndefined();
    expect(config.logLevel).toBe('debug');
    expect(config.skipAuth).toBe(false);
  });

  it('throws when AZURE_AI_PROJECT_ENDPOINT is missing', () => {
    expect(() => loadConfig({})).toThrow('AZURE_AI_PROJECT_ENDPOINT');
  });

  it('overrides all optional fields', () => {
    const config = loadConfig({
      ...REQUIRED_ENV,
      PORT: '8080',
      HOST: '127.0.0.1',
      AGENT_MODEL: 'gpt-4o',
      AGENT_NAME: 'Test Agent',
      CAPTAIN_INSTRUCTIONS: 'Custom captain prompt.',
      SHANTY_INSTRUCTIONS: 'Custom shanty prompt.',
      TREASURE_INSTRUCTIONS: 'Custom treasure prompt.',
      CREW_INSTRUCTIONS: 'Custom crew prompt.',
      APPLICATIONINSIGHTS_CONNECTION_STRING: 'InstrumentationKey=test',
      LOG_LEVEL: 'info',
      SKIP_AUTH: 'true'
    });
    expect(config.port).toBe(8080);
    expect(config.host).toBe('127.0.0.1');
    expect(config.model).toBe('gpt-4o');
    expect(config.agentName).toBe('Test Agent');
    expect(config.captainInstructions).toBe('Custom captain prompt.');
    expect(config.shantyInstructions).toBe('Custom shanty prompt.');
    expect(config.treasureInstructions).toBe('Custom treasure prompt.');
    expect(config.crewInstructions).toBe('Custom crew prompt.');
    expect(config.applicationInsightsConnectionString).toBe('InstrumentationKey=test');
    expect(config.logLevel).toBe('info');
    expect(config.skipAuth).toBe(true);
  });

  it('supports TRIAGE_INSTRUCTIONS as a legacy alias', () => {
    const config = loadConfig({
      ...REQUIRED_ENV,
      TRIAGE_INSTRUCTIONS: 'Legacy triage prompt.'
    });
    expect(config.captainInstructions).toBe('Legacy triage prompt.');
  });

  it('strips trailing slashes from endpoint', () => {
    const config = loadConfig({
      AZURE_AI_PROJECT_ENDPOINT: 'https://test.ai.azure.com/'
    });
    expect(config.azureEndpoint).toBe('https://test.ai.azure.com');
  });

  it('strips multiple trailing slashes', () => {
    const config = loadConfig({
      AZURE_AI_PROJECT_ENDPOINT: 'https://test.ai.azure.com///'
    });
    expect(config.azureEndpoint).toBe('https://test.ai.azure.com');
  });

  it('treats SKIP_AUTH as false for any non-"true" value', () => {
    expect(loadConfig({ ...REQUIRED_ENV, SKIP_AUTH: 'false' }).skipAuth).toBe(false);
    expect(loadConfig({ ...REQUIRED_ENV, SKIP_AUTH: '1' }).skipAuth).toBe(false);
    expect(loadConfig({ ...REQUIRED_ENV, SKIP_AUTH: '' }).skipAuth).toBe(false);
    expect(loadConfig(REQUIRED_ENV).skipAuth).toBe(false);
  });

  it('parses PORT as integer', () => {
    const config = loadConfig({ ...REQUIRED_ENV, PORT: '9999' });
    expect(config.port).toBe(9999);
  });

  it('defaults PORT to 3000 when not set', () => {
    const config = loadConfig(REQUIRED_ENV);
    expect(config.port).toBe(3000);
  });
});
