import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { detectAgentVariant } from '../lib/compose-helpers.ts';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('detectAgentVariant', () => {
  it('detects variants from infra-suffixed strategy names', () => {
    expect(detectAgentVariant('typescript-foundry-agent-service-aca')).toBe('foundry-agent-service');
    expect(detectAgentVariant('typescript-openai-agent-sdk-aca')).toBe('openai-agent-sdk');
    expect(detectAgentVariant('csharp-microsoft-agent-framework-aca')).toBe('microsoft-agent-framework');
  });

  it('prefers strategy provenance when available', () => {
    const strategyDir = mkdtempSync(join(tmpdir(), 'caira-compose-helper-'));
    tempDirs.push(strategyDir);
    writeFileSync(
      join(strategyDir, 'strategy.provenance.json'),
      JSON.stringify({ flavor: { agentVariant: 'openai-agent-sdk' } })
    );

    expect(detectAgentVariant(strategyDir)).toBe('openai-agent-sdk');
  });
});
