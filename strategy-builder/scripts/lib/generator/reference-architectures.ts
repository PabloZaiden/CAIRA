/**
 * Reference architecture discovery — walks strategy-builder/infra/reference-architectures,
 * reads reference-architecture.json manifests, validates them, and returns typed
 * DiscoveredReferenceArchitecture objects.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { DiscoveredReferenceArchitecture, ReferenceArchitectureManifest } from './types.ts';

type ReferenceArchitectureValidationResult =
  | { readonly ok: true; readonly manifest: ReferenceArchitectureManifest }
  | { readonly ok: false; readonly errors: readonly string[] };

function validateReferenceArchitectureManifest(raw: unknown): ReferenceArchitectureValidationResult {
  const errors: string[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['manifest must be a JSON object'] };
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj['id'] !== 'string' || obj['id'].length === 0) {
    errors.push('"id" must be a non-empty string');
  }

  if (typeof obj['displayName'] !== 'string' || obj['displayName'].length === 0) {
    errors.push('"displayName" must be a non-empty string');
  }

  if (obj['description'] !== undefined && typeof obj['description'] !== 'string') {
    errors.push('"description" must be a string if present');
  }

  if (obj['default'] !== undefined && typeof obj['default'] !== 'boolean') {
    errors.push('"default" must be a boolean if present');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, manifest: obj as unknown as ReferenceArchitectureManifest };
}

export async function discoverReferenceArchitectures(
  referenceArchitecturesRoot: string,
  repoRoot: string
): Promise<DiscoveredReferenceArchitecture[]> {
  try {
    const rootStat = await stat(referenceArchitecturesRoot);
    if (!rootStat.isDirectory()) {
      throw new Error(`Reference architectures path is not a directory: ${referenceArchitecturesRoot}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Reference architectures directory not found: ${referenceArchitecturesRoot}`);
    }
    throw err;
  }

  const entries = await readdir(referenceArchitecturesRoot, { withFileTypes: true });
  const architectures: DiscoveredReferenceArchitecture[] = [];
  const validationErrors: string[] = [];

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) {
      continue;
    }

    const dir = join(referenceArchitecturesRoot, entry.name);
    const manifestPath = join(dir, 'reference-architecture.json');

    try {
      const raw = await readFile(manifestPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      const result = validateReferenceArchitectureManifest(parsed);

      if (!result.ok) {
        for (const error of result.errors) {
          validationErrors.push(`${relative(repoRoot, manifestPath)}: ${error}`);
        }
        continue;
      }

      architectures.push({
        manifest: result.manifest,
        dir,
        relPath: relative(repoRoot, dir)
      });
    } catch (err) {
      validationErrors.push(`${relative(repoRoot, manifestPath)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (validationErrors.length > 0) {
    throw new Error(
      `Reference architecture manifest validation failed:\n${validationErrors.map((e) => `  - ${e}`).join('\n')}`
    );
  }

  if (architectures.length === 0) {
    throw new Error(`No reference-architecture.json files found under ${referenceArchitecturesRoot}`);
  }

  return architectures;
}
