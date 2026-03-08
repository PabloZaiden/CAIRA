import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPrivateE2ECommand,
  buildPrivateFrontendHealthCommand,
  deriveDeepHealthUrl
} from '../lib/private-test-commands.ts';

describe('private test command helpers', () => {
  it('derives the deep health URL from a frontend URL', () => {
    expect(deriveDeepHealthUrl('https://example.internal/')).toBe('https://example.internal/health/deep');
  });

  it('builds a bash-syntax-valid private frontend health command', () => {
    const command = buildPrivateFrontendHealthCommand('https://example.internal/health/deep');
    const result = spawnSync('bash', ['-n'], {
      input: command,
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(command).toContain('curl --connect-timeout 5 --max-time 10 -fsSk "$health_url" >/dev/null');
  });

  it('runs the private frontend health command through bash stdin', () => {
    const command = buildPrivateFrontendHealthCommand('https://example.internal/health/deep');
    const result = spawnSync('bash', ['-lc', 'curl(){ return 0; }\nexport -f curl\nbash -s'], {
      input: command,
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('builds a bash-syntax-valid private E2E command', () => {
    const command = buildPrivateE2ECommand('/tmp/caira-e2e', 'https://example.internal');
    const result = spawnSync('bash', ['-n'], {
      input: command,
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(command).toContain("cd '/tmp/caira-e2e'");
    expect(command).toContain("E2E_BASE_URL='https://example.internal' npx vitest run --reporter verbose");
  });

  it('runs the private E2E command through bash stdin', () => {
    const remoteDir = mkdtempSync(join(tmpdir(), 'caira-e2e-'));

    try {
      const command = buildPrivateE2ECommand(remoteDir, 'https://example.internal');
      const result = spawnSync(
        'bash',
        [
          '-lc',
          'npm(){ echo "npm:$*"; }\n' + 'npx(){ echo "base-url:$E2E_BASE_URL"; }\n' + 'export -f npm npx\n' + 'bash -s'
        ],
        {
          input: command,
          encoding: 'utf8'
        }
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('npm:ci --no-audit --no-fund');
      expect(result.stdout).toContain('base-url:https://example.internal');
    } finally {
      rmSync(remoteDir, { recursive: true, force: true });
    }
  });
});
