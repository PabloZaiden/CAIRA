import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  copyComponent,
  listComponentFiles,
  transformTsconfigExtends,
  shouldIncludeDir,
  shouldIncludeFile
} from '../../lib/generator/copier.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
  tempDir = join(tmpdir(), `caira-copier-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(tempDir, { recursive: true });
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function writeTestFile(relPath: string, content: string): Promise<void> {
  const full = join(tempDir, 'source', relPath);
  await mkdir(join(full, '..'), { recursive: true });
  await writeFile(full, content);
}

// ---------------------------------------------------------------------------
// transformTsconfigExtends
// ---------------------------------------------------------------------------

describe('transformTsconfigExtends', () => {
  it('rewrites a 4-level deep extends path', () => {
    const input = `{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {}
}`;
    const result = transformTsconfigExtends(input);
    expect(result).toContain('"extends": "../tsconfig.base.json"');
  });

  it('rewrites a 3-level deep extends path', () => {
    const input = `{ "extends": "../../../tsconfig.base.json" }`;
    const result = transformTsconfigExtends(input);
    expect(result).toContain('"extends": "../tsconfig.base.json"');
  });

  it('rewrites a 1-level deep extends path', () => {
    const input = `{ "extends": "../tsconfig.base.json" }`;
    const result = transformTsconfigExtends(input);
    expect(result).toContain('"extends": "../tsconfig.base.json"');
  });

  it('does not modify extends paths to other files', () => {
    const input = `{ "extends": "../../../some-other-config.json" }`;
    const result = transformTsconfigExtends(input);
    expect(result).toBe(input);
  });

  it('does not modify content without extends', () => {
    const input = `{ "compilerOptions": { "target": "ES2024" } }`;
    const result = transformTsconfigExtends(input);
    expect(result).toBe(input);
  });

  it('preserves all other content', () => {
    const input = `{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "lib": ["ES2024", "DOM"]
  },
  "include": ["src/**/*.ts"]
}`;
    const result = transformTsconfigExtends(input);
    expect(result).toContain('"rootDir": "."');
    expect(result).toContain('"lib": ["ES2024", "DOM"]');
    expect(result).toContain('"include": ["src/**/*.ts"]');
  });
});

// ---------------------------------------------------------------------------
// shouldIncludeDir / shouldIncludeFile
// ---------------------------------------------------------------------------

describe('shouldIncludeDir', () => {
  it('excludes node_modules', () => expect(shouldIncludeDir('node_modules')).toBe(false));
  it('excludes dist', () => expect(shouldIncludeDir('dist')).toBe(false));
  it('excludes .turbo', () => expect(shouldIncludeDir('.turbo')).toBe(false));
  it('excludes coverage', () => expect(shouldIncludeDir('coverage')).toBe(false));
  it('excludes .terraform', () => expect(shouldIncludeDir('.terraform')).toBe(false));
  it('includes src', () => expect(shouldIncludeDir('src')).toBe(true));
  it('includes tests', () => expect(shouldIncludeDir('tests')).toBe(true));
});

describe('shouldIncludeFile', () => {
  it('excludes package-lock.json', () => expect(shouldIncludeFile('package-lock.json')).toBe(false));
  it('excludes .dockerignore', () => expect(shouldIncludeFile('.dockerignore')).toBe(false));
  it('excludes .terraform.lock.hcl', () => expect(shouldIncludeFile('.terraform.lock.hcl')).toBe(false));
  it('excludes terraform state files', () => expect(shouldIncludeFile('terraform.tfstate')).toBe(false));
  it('excludes tfstate backup files', () => expect(shouldIncludeFile('terraform.tfstate.backup')).toBe(false));
  it('excludes generated tfvars files', () => expect(shouldIncludeFile('.deploy.auto.tfvars.json')).toBe(false));
  it('includes package.json', () => expect(shouldIncludeFile('package.json')).toBe(true));
  it('includes tsconfig.json', () => expect(shouldIncludeFile('tsconfig.json')).toBe(true));
  it('includes Dockerfile', () => expect(shouldIncludeFile('Dockerfile')).toBe(true));
  it('includes source files', () => expect(shouldIncludeFile('index.ts')).toBe(true));
});

// ---------------------------------------------------------------------------
// copyComponent
// ---------------------------------------------------------------------------

describe('copyComponent', () => {
  it('copies all files from source to target', async () => {
    await writeTestFile('package.json', '{"name":"test"}');
    await writeTestFile('src/index.ts', 'console.log("hello")');
    await writeTestFile('Dockerfile', 'FROM node:24');

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.files).toHaveLength(3);
    expect(result.files).toContain('package.json');
    expect(result.files).toContain('src/index.ts');
    expect(result.files).toContain('Dockerfile');

    // Verify actual files exist
    const pkg = await readFile(join(target, 'package.json'), 'utf-8');
    expect(pkg).toBe('{"name":"test"}');
  });

  it('skips node_modules directory', async () => {
    await writeTestFile('src/index.ts', 'export {}');
    await writeTestFile('node_modules/foo/index.js', 'module.exports = {}');

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.files).toHaveLength(1);
    expect(result.files).toContain('src/index.ts');
  });

  it('skips dist directory', async () => {
    await writeTestFile('src/index.ts', 'export {}');
    await writeTestFile('dist/index.js', 'export {}');

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.files).toHaveLength(1);
  });

  it('skips package-lock.json', async () => {
    await writeTestFile('package.json', '{}');
    await writeTestFile('package-lock.json', '{}');

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.files).toEqual(['package.json']);
  });

  it('transforms tsconfig.json extends path', async () => {
    const tsconfig = `{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "." }
}`;
    await writeTestFile('tsconfig.json', tsconfig);

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.transformed).toContain('tsconfig.json');

    const written = await readFile(join(target, 'tsconfig.json'), 'utf-8');
    expect(written).toContain('"../tsconfig.base.json"');
    expect(written).not.toContain('../../../../');
  });

  it('transforms tsconfig.node.json extends path', async () => {
    const tsconfig = `{ "extends": "../../../tsconfig.base.json" }`;
    await writeTestFile('tsconfig.node.json', tsconfig);

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.transformed).toContain('tsconfig.node.json');
    const written = await readFile(join(target, 'tsconfig.node.json'), 'utf-8');
    expect(written).toContain('"../tsconfig.base.json"');
  });

  it('does not mark tsconfig as transformed if extends is already correct', async () => {
    const tsconfig = `{ "extends": "../tsconfig.base.json" }`;
    await writeTestFile('tsconfig.json', tsconfig);

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.files).toContain('tsconfig.json');
    expect(result.transformed).toHaveLength(0);
  });

  it('tracks created directories', async () => {
    await writeTestFile('src/routes/health.ts', 'export {}');
    await writeTestFile('tests/unit/health.test.ts', 'export {}');

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.dirs).toContain('src');
    expect(result.dirs).toContain('src/routes');
    expect(result.dirs).toContain('tests');
    expect(result.dirs).toContain('tests/unit');
  });

  it('handles deeply nested files', async () => {
    await writeTestFile('src/lib/utils/helpers/format.ts', 'export {}');

    const source = join(tempDir, 'source');
    const target = join(tempDir, 'target');

    const result = await copyComponent(source, target);

    expect(result.files).toContain('src/lib/utils/helpers/format.ts');
    const content = await readFile(join(target, 'src/lib/utils/helpers/format.ts'), 'utf-8');
    expect(content).toBe('export {}');
  });
});

// ---------------------------------------------------------------------------
// listComponentFiles
// ---------------------------------------------------------------------------

describe('listComponentFiles', () => {
  it('lists all included files without copying', async () => {
    await writeTestFile('package.json', '{}');
    await writeTestFile('src/index.ts', '');
    await writeTestFile('node_modules/foo/index.js', '');

    const source = join(tempDir, 'source');
    const files = await listComponentFiles(source);

    expect(files).toHaveLength(2);
    expect(files).toContain('package.json');
    expect(files).toContain('src/index.ts');
  });

  it('returns empty array for nonexistent directory', async () => {
    const files = await listComponentFiles(join(tempDir, 'nonexistent'));
    expect(files).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: copy real component
// ---------------------------------------------------------------------------

describe('copyComponent (real component)', () => {
  it('copies the real API component correctly', async () => {
    const repoRoot = join(import.meta.dirname, '..', '..', '..');
    const source = join(repoRoot, 'components', 'api', 'typescript');
    const target = join(tempDir, 'api');

    const result = await copyComponent(source, target);

    // Should have common files
    expect(result.files).toContain('package.json');
    expect(result.files).toContain('tsconfig.json');
    expect(result.files).toContain('Dockerfile');
    expect(result.files).toContain('component.json');
    expect(result.files.some((f) => f.startsWith('src/'))).toBe(true);

    // Should NOT have node_modules or dist
    expect(result.files.every((f) => !f.startsWith('node_modules/'))).toBe(true);
    expect(result.files.every((f) => !f.startsWith('dist/'))).toBe(true);
    expect(result.files.every((f) => f !== 'package-lock.json')).toBe(true);

    // tsconfig should be transformed
    expect(result.transformed).toContain('tsconfig.json');
    const tsconfig = await readFile(join(target, 'tsconfig.json'), 'utf-8');
    expect(tsconfig).toContain('../tsconfig.base.json');
  });
});
