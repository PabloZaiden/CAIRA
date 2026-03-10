/** @vitest-environment node */

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('frontend Dockerfile', () => {
  it('copies the full BFF source tree needed at runtime', async () => {
    const dockerfilePath = fileURLToPath(new URL('../Dockerfile', import.meta.url));
    const content = await readFile(dockerfilePath, 'utf-8');

    expect(content).toContain('COPY src ./src');
    expect(content).not.toContain('COPY src/server.ts ./src/server.ts');
  });
});
