import { describe, expect, it } from 'vitest';
import { buildMatrix } from '../../lib/generator/matrix.ts';
import type {
  ComponentManifest,
  DiscoveredComponent,
  DiscoveredReferenceArchitecture
} from '../../lib/generator/types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComponent(
  overrides: Partial<ComponentManifest> & Pick<ComponentManifest, 'name' | 'type'>,
  relPath?: string
): DiscoveredComponent {
  const manifest: ComponentManifest = {
    language: 'typescript',
    port: 3000,
    healthEndpoint: '/health',
    requiredEnv: [],
    optionalEnv: [],
    contractSpec: 'contracts/agent-api.openapi.yaml',
    ...overrides
  };
  const rp =
    relPath ?? `components/${manifest.type}/${manifest.language}${manifest.variant ? `/${manifest.variant}` : ''}`;
  return {
    manifest,
    dir: `/repo/${rp}`,
    relPath: rp
  };
}

function makeReferenceArchitecture(
  id = 'foundry_agentic_app',
  displayName = 'Foundry Agentic App'
): DiscoveredReferenceArchitecture {
  return {
    manifest: { id, displayName, default: true },
    dir: `/repo/infra/reference-architectures/${id}`,
    relPath: `infra/reference-architectures/${id}`
  };
}

const referenceArchitectures = [makeReferenceArchitecture()];

const agent1 = makeComponent({
  name: 'agent',
  type: 'agent',
  variant: 'foundry-agent-service',
  requiredEnv: ['AZURE_AI_PROJECT_ENDPOINT']
});

const agent2 = makeComponent({
  name: 'agent',
  type: 'agent',
  variant: 'openai-agent-sdk',
  requiredEnv: ['AZURE_OPENAI_ENDPOINT']
});

const api = makeComponent({
  name: 'api',
  type: 'api',
  port: 4000,
  requiredEnv: ['AGENT_SERVICE_URL'],
  contractSpec: 'contracts/backend-api.openapi.yaml'
});

const frontend = makeComponent({
  name: 'frontend',
  type: 'frontend',
  variant: 'react-typescript',
  port: 8080,
  contractSpec: 'contracts/backend-api.openapi.yaml'
});

const defaultIac = makeComponent({
  name: 'iac',
  type: 'iac',
  variant: 'azure-container-apps',
  strategySuffix: 'aca',
  referenceArchitectures: ['foundry_agentic_app']
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildMatrix', () => {
  it('produces correct samples from 2 agents + api + frontend', () => {
    const result = buildMatrix([agent1, agent2, api, frontend, defaultIac], referenceArchitectures);

    expect(result.samples).toHaveLength(2);
    expect(result.skipped).toHaveLength(0);

    const names = result.samples.map((s) => s.name);
    expect(names).toEqual(['typescript-foundry-agent-service-aca', 'typescript-openai-agent-sdk-aca']);
  });

  it('sets correct fields on each sample config', () => {
    const result = buildMatrix([agent1, api, frontend, defaultIac], referenceArchitectures);

    expect(result.samples).toHaveLength(1);
    const sample = result.samples[0];
    expect(sample?.name).toBe('typescript-foundry-agent-service-aca');
    expect(sample?.relativeDir).toBe('foundry_agentic_app/typescript-foundry-agent-service-aca');
    expect(sample?.referenceArchitecture.manifest.id).toBe('foundry_agentic_app');
    expect(sample?.language).toBe('typescript');
    expect(sample?.agentVariant).toBe('foundry-agent-service');
    expect(sample?.infraVariant).toBe('aca');
    expect(sample?.agent).toBe(agent1);
    expect(sample?.api).toBe(api);
    expect(sample?.frontend).toBe(frontend);
    expect(sample?.iac).toBe(defaultIac);
  });

  it('skips agents with no matching API language', () => {
    const pythonAgent = makeComponent({
      name: 'agent',
      type: 'agent',
      variant: 'python-agent',
      language: 'python'
    });

    const result = buildMatrix([pythonAgent, api, frontend, defaultIac], referenceArchitectures);

    expect(result.samples).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('No API component');
    expect(result.skipped[0]?.reason).toContain('python');
  });

  it('skips agents with no variant', () => {
    const noVariant = makeComponent({
      name: 'agent',
      type: 'agent'
    });

    const result = buildMatrix([noVariant, api, frontend, defaultIac], referenceArchitectures);

    expect(result.samples).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('no "variant"');
  });

  it('skips when no frontend exists', () => {
    const result = buildMatrix([agent1, api, defaultIac], referenceArchitectures);

    expect(result.samples).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]?.reason).toContain('No frontend');
  });

  it('returns empty matrix when no agents exist', () => {
    const result = buildMatrix([api, frontend, defaultIac], referenceArchitectures);

    expect(result.samples).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('returns empty matrix for empty input', () => {
    const result = buildMatrix([], referenceArchitectures);

    expect(result.samples).toHaveLength(0);
    expect(result.skipped).toHaveLength(0);
  });

  it('attaches IaC component when available', () => {
    const result = buildMatrix([agent1, api, frontend, defaultIac], referenceArchitectures);

    expect(result.samples).toHaveLength(1);
    expect(result.samples[0]?.iac).toBe(defaultIac);
  });

  it('skips combinations when no compatible IaC exists', () => {
    const result = buildMatrix([agent1, api, frontend], referenceArchitectures);

    expect(result.samples).toHaveLength(0);
    expect(result.skipped[0]?.reason).toContain('No IaC component');
  });

  it('includes each compatible IaC variant', () => {
    const tsIac = makeComponent({
      name: 'iac',
      type: 'iac',
      variant: 'aca-ts',
      language: 'typescript',
      strategySuffix: 'aca',
      referenceArchitectures: ['foundry_agentic_app']
    });
    const aksIac = makeComponent({
      name: 'iac',
      type: 'iac',
      variant: 'aks-ts',
      language: 'typescript',
      strategySuffix: 'aks',
      referenceArchitectures: ['foundry_agentic_app']
    });

    const result = buildMatrix([agent1, api, frontend, tsIac, aksIac], referenceArchitectures);

    expect(result.samples).toHaveLength(2);
    expect(result.samples.map((sample) => sample.name)).toEqual([
      'typescript-foundry-agent-service-aca',
      'typescript-foundry-agent-service-aks'
    ]);
  });

  it('sorts samples by name', () => {
    // Feed agents in reverse order
    const result = buildMatrix([agent2, agent1, api, frontend, defaultIac], referenceArchitectures);

    const names = result.samples.map((s) => s.name);
    expect(names).toEqual(['typescript-foundry-agent-service-aca', 'typescript-openai-agent-sdk-aca']);
  });

  it('handles multiple languages correctly', () => {
    const pyAgent = makeComponent({
      name: 'agent',
      type: 'agent',
      variant: 'py-agent',
      language: 'python'
    });
    const pyApi = makeComponent({
      name: 'api',
      type: 'api',
      language: 'python',
      port: 4000
    });

    const result = buildMatrix([agent1, pyAgent, api, pyApi, frontend, defaultIac], referenceArchitectures);

    expect(result.samples).toHaveLength(2);
    const names = result.samples.map((s) => s.name).sort();
    expect(names).toEqual(['python-py-agent-aca', 'typescript-foundry-agent-service-aca']);
  });
});
