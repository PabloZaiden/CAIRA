import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateManifest, discoverComponents } from '../../lib/generator/discovery.ts';
import type { ComponentManifest } from '../../lib/generator/types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A minimal valid agent manifest for testing. */
function validAgentManifest(): ComponentManifest {
  return {
    name: 'agent',
    type: 'agent',
    variant: 'test-variant',
    language: 'typescript',
    description: 'Test agent',
    port: 3000,
    healthEndpoint: '/health',
    requiredEnv: ['AZURE_OPENAI_ENDPOINT'],
    optionalEnv: ['LOG_LEVEL'],
    contractSpec: 'contracts/agent-api.openapi.yaml'
  };
}

/** A minimal valid API manifest. */
function validApiManifest(): ComponentManifest {
  return {
    name: 'api',
    type: 'api',
    language: 'typescript',
    description: 'Test API',
    port: 4000,
    healthEndpoint: '/health',
    requiredEnv: ['AGENT_SERVICE_URL'],
    optionalEnv: ['LOG_LEVEL'],
    contractSpec: 'contracts/backend-api.openapi.yaml'
  };
}

/** A minimal valid frontend manifest. */
function validFrontendManifest(): ComponentManifest {
  return {
    name: 'frontend',
    type: 'frontend',
    variant: 'react-typescript',
    language: 'typescript',
    description: 'Test frontend',
    port: 8080,
    healthEndpoint: '/health',
    requiredEnv: [],
    optionalEnv: [],
    contractSpec: 'contracts/backend-api.openapi.yaml'
  };
}

// ---------------------------------------------------------------------------
// validateManifest
// ---------------------------------------------------------------------------

describe('validateManifest', () => {
  it('accepts a valid agent manifest', () => {
    const result = validateManifest(validAgentManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.name).toBe('agent');
      expect(result.manifest.type).toBe('agent');
      expect(result.manifest.variant).toBe('test-variant');
    }
  });

  it('accepts a valid API manifest (no variant)', () => {
    const result = validateManifest(validApiManifest());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.manifest.variant).toBeUndefined();
    }
  });

  it('rejects null', () => {
    const result = validateManifest(null);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContain('manifest must be a JSON object');
  });

  it('rejects an array', () => {
    const result = validateManifest([]);
    expect(result.ok).toBe(false);
  });

  it('rejects a string', () => {
    const result = validateManifest('hello');
    expect(result.ok).toBe(false);
  });

  it('rejects missing name', () => {
    const m = { ...validAgentManifest() } as Record<string, unknown>;
    delete m['name'];
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('"name"'))).toBe(true);
  });

  it('rejects empty name', () => {
    const result = validateManifest({ ...validAgentManifest(), name: '' });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = validateManifest({ ...validAgentManifest(), type: 'invalid' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('"type"'))).toBe(true);
  });

  it('rejects non-integer port', () => {
    const result = validateManifest({ ...validAgentManifest(), port: 3.5 });
    expect(result.ok).toBe(false);
  });

  it('rejects zero port', () => {
    const result = validateManifest({ ...validAgentManifest(), port: 0 });
    expect(result.ok).toBe(false);
  });

  it('rejects negative port', () => {
    const result = validateManifest({ ...validAgentManifest(), port: -1 });
    expect(result.ok).toBe(false);
  });

  it('rejects healthEndpoint not starting with /', () => {
    const result = validateManifest({ ...validAgentManifest(), healthEndpoint: 'health' });
    expect(result.ok).toBe(false);
  });

  it('rejects requiredEnv that is not an array', () => {
    const result = validateManifest({ ...validAgentManifest(), requiredEnv: 'FOO' });
    expect(result.ok).toBe(false);
  });

  it('rejects requiredEnv with non-string elements', () => {
    const result = validateManifest({ ...validAgentManifest(), requiredEnv: [123] });
    expect(result.ok).toBe(false);
  });

  it('rejects optionalEnv that is not an array', () => {
    const result = validateManifest({ ...validAgentManifest(), optionalEnv: null });
    expect(result.ok).toBe(false);
  });

  it('rejects missing contractSpec', () => {
    const m = { ...validAgentManifest() } as Record<string, unknown>;
    delete m['contractSpec'];
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
  });

  it('rejects empty contractSpec', () => {
    const result = validateManifest({ ...validAgentManifest(), contractSpec: '' });
    expect(result.ok).toBe(false);
  });

  it('collects multiple errors at once', () => {
    const result = validateManifest({ name: '', type: 'bad', port: -1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Should have errors for name, type, port, healthEndpoint, requiredEnv, optionalEnv, contractSpec
      expect(result.errors.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('accepts all valid component types', () => {
    for (const type of ['agent', 'api', 'frontend', 'iac'] as const) {
      const result = validateManifest({ ...validAgentManifest(), type });
      expect(result.ok).toBe(true);
    }
  });

  it('accepts variant as undefined (not present)', () => {
    const m = { ...validAgentManifest() } as Record<string, unknown>;
    delete m['variant'];
    const result = validateManifest(m);
    expect(result.ok).toBe(true);
  });

  it('rejects non-string variant', () => {
    const result = validateManifest({ ...validAgentManifest(), variant: 123 });
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// discoverComponents
// ---------------------------------------------------------------------------

describe('discoverComponents', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = join(tmpdir(), `caira-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tempDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  /** Helper to write a component.json into a nested directory. */
  async function writeComponent(relPath: string, manifest: ComponentManifest): Promise<void> {
    const dir = join(tempDir, 'components', relPath);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'component.json'), JSON.stringify(manifest, null, 2));
  }

  it('discovers components in the standard directory structure', async () => {
    await writeComponent('agent/typescript/test-variant', validAgentManifest());
    await writeComponent('api/typescript', validApiManifest());
    await writeComponent('frontend/react-typescript', validFrontendManifest());

    const components = await discoverComponents(join(tempDir, 'components'), tempDir);

    expect(components).toHaveLength(3);
    const types = components.map((c) => c.manifest.type).sort();
    expect(types).toEqual(['agent', 'api', 'frontend']);
  });

  it('returns correct relPath for each component', async () => {
    await writeComponent('agent/typescript/test-variant', validAgentManifest());

    const components = await discoverComponents(join(tempDir, 'components'), tempDir);

    expect(components[0]?.relPath).toBe('components/agent/typescript/test-variant');
  });

  it('returns correct absolute dir for each component', async () => {
    await writeComponent('api/typescript', validApiManifest());

    const components = await discoverComponents(join(tempDir, 'components'), tempDir);

    expect(components[0]?.dir).toBe(join(tempDir, 'components', 'api', 'typescript'));
  });

  it('throws when components directory does not exist', async () => {
    await expect(discoverComponents(join(tempDir, 'nonexistent'), tempDir)).rejects.toThrow(
      'Components directory not found'
    );
  });

  it('throws when components directory is empty (no component.json files)', async () => {
    const emptyDir = join(tempDir, 'empty');
    await mkdir(emptyDir, { recursive: true });

    await expect(discoverComponents(emptyDir, tempDir)).rejects.toThrow('No component.json files found');
  });

  it('throws on invalid manifest with descriptive error', async () => {
    const dir = join(tempDir, 'components', 'bad');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'component.json'), JSON.stringify({ name: '' }));

    await expect(discoverComponents(join(tempDir, 'components'), tempDir)).rejects.toThrow(
      'Component manifest validation failed'
    );
  });

  it('throws on invalid JSON in component.json', async () => {
    const dir = join(tempDir, 'components', 'bad');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'component.json'), '{not valid json');

    await expect(discoverComponents(join(tempDir, 'components'), tempDir)).rejects.toThrow('invalid JSON');
  });

  it('skips node_modules directories during traversal', async () => {
    // Put a valid component.json inside node_modules — should be ignored
    const nmDir = join(tempDir, 'components', 'node_modules', 'fake-pkg');
    await mkdir(nmDir, { recursive: true });
    await writeFile(join(nmDir, 'component.json'), JSON.stringify(validAgentManifest()));

    // Put a real component outside node_modules
    await writeComponent('agent/typescript/real', validAgentManifest());

    const components = await discoverComponents(join(tempDir, 'components'), tempDir);

    expect(components).toHaveLength(1);
    expect(components[0]?.relPath).toBe('components/agent/typescript/real');
  });

  it('discovers multiple agent variants', async () => {
    const variant1 = { ...validAgentManifest(), variant: 'variant-a' };
    const variant2 = { ...validAgentManifest(), variant: 'variant-b' };

    await writeComponent('agent/typescript/variant-a', variant1);
    await writeComponent('agent/typescript/variant-b', variant2);

    const components = await discoverComponents(join(tempDir, 'components'), tempDir);

    expect(components).toHaveLength(2);
    const variants = components.map((c) => c.manifest.variant).sort();
    expect(variants).toEqual(['variant-a', 'variant-b']);
  });

  it('sorts results consistently', async () => {
    await writeComponent('frontend/react-typescript', validFrontendManifest());
    await writeComponent('api/typescript', validApiManifest());
    await writeComponent('agent/typescript/test-variant', validAgentManifest());

    const components = await discoverComponents(join(tempDir, 'components'), tempDir);

    // Should be sorted by directory path
    const paths = components.map((c) => c.relPath);
    expect(paths).toEqual([...paths].sort());
  });
});

// ---------------------------------------------------------------------------
// Integration: discover real components
// ---------------------------------------------------------------------------

describe('discoverComponents (real repo)', () => {
  it('discovers the actual project components', async () => {
    // This test runs against the real components/ directory
    const repoRoot = join(import.meta.dirname, '..', '..', '..');
    const componentsRoot = join(repoRoot, 'components');

    const components = await discoverComponents(componentsRoot, repoRoot);

    // We expect at least 6 components: 3 agents, 2 apis, 1 frontend
    expect(components.length).toBeGreaterThanOrEqual(6);

    const agents = components.filter((c) => c.manifest.type === 'agent');
    const apis = components.filter((c) => c.manifest.type === 'api');
    const frontends = components.filter((c) => c.manifest.type === 'frontend');

    expect(agents.length).toBeGreaterThanOrEqual(3);
    expect(apis.length).toBeGreaterThanOrEqual(2);
    expect(frontends.length).toBeGreaterThanOrEqual(1);

    // Check known variants exist
    const agentVariants = agents.map((a) => a.manifest.variant).sort();
    expect(agentVariants).toContain('foundry-agent-service');
    expect(agentVariants).toContain('microsoft-agent-framework');
    expect(agentVariants).toContain('openai-agent-sdk');
  });
});
