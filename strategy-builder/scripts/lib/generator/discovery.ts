/**
 * Component discovery — walks the components/ tree, reads component.json
 * manifests, validates them, and returns typed DiscoveredComponent objects.
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join, relative } from 'node:path';
import type { ComponentManifest, ComponentType, DiscoveredComponent, ValidationResult } from './types.ts';

// ---------------------------------------------------------------------------
// Manifest validation
// ---------------------------------------------------------------------------

const VALID_TYPES: readonly ComponentType[] = ['agent', 'api', 'frontend', 'iac'];

/**
 * Validate a parsed JSON object against the ComponentManifest schema.
 * Returns either the typed manifest or a list of human-readable errors.
 */
export function validateManifest(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['manifest must be a JSON object'] };
  }

  const obj = raw as Record<string, unknown>;

  // name — required string
  if (typeof obj['name'] !== 'string' || obj['name'].length === 0) {
    errors.push('"name" must be a non-empty string');
  }

  // type — required, one of the valid types
  if (typeof obj['type'] !== 'string' || !VALID_TYPES.includes(obj['type'] as ComponentType)) {
    errors.push(`"type" must be one of: ${VALID_TYPES.join(', ')}`);
  }
  const isIac = obj['type'] === 'iac';

  // variant — optional string
  if (obj['variant'] !== undefined && typeof obj['variant'] !== 'string') {
    errors.push('"variant" must be a string if present');
  }

  // language — required string
  if (typeof obj['language'] !== 'string' || obj['language'].length === 0) {
    errors.push('"language" must be a non-empty string');
  }

  // description — optional string
  if (obj['description'] !== undefined && typeof obj['description'] !== 'string') {
    errors.push('"description" must be a string if present');
  }

  // port — required positive integer for runtime components, optional for IaC
  if (obj['port'] !== undefined) {
    if (typeof obj['port'] !== 'number' || !Number.isInteger(obj['port']) || obj['port'] <= 0) {
      errors.push('"port" must be a positive integer');
    }
  } else if (!isIac) {
    errors.push('"port" must be a positive integer');
  }

  // healthEndpoint — required for runtime components, optional for IaC
  if (obj['healthEndpoint'] !== undefined) {
    if (typeof obj['healthEndpoint'] !== 'string' || !obj['healthEndpoint'].startsWith('/')) {
      errors.push('"healthEndpoint" must be a string starting with "/"');
    }
  } else if (!isIac) {
    errors.push('"healthEndpoint" must be a string starting with "/"');
  }

  // requiredEnv — required array of strings
  if (!Array.isArray(obj['requiredEnv']) || !obj['requiredEnv'].every((v: unknown) => typeof v === 'string')) {
    errors.push('"requiredEnv" must be an array of strings');
  }

  // optionalEnv — required array of strings
  if (!Array.isArray(obj['optionalEnv']) || !obj['optionalEnv'].every((v: unknown) => typeof v === 'string')) {
    errors.push('"optionalEnv" must be an array of strings');
  }

  // contractSpec — required string
  if (typeof obj['contractSpec'] !== 'string' || obj['contractSpec'].length === 0) {
    errors.push('"contractSpec" must be a non-empty string');
  }

  // strategySuffix — optional string
  if (obj['strategySuffix'] !== undefined && typeof obj['strategySuffix'] !== 'string') {
    errors.push('"strategySuffix" must be a string if present');
  }

  // referenceArchitectures — optional array of strings
  if (
    obj['referenceArchitectures'] !== undefined &&
    (!Array.isArray(obj['referenceArchitectures']) ||
      !obj['referenceArchitectures'].every((v: unknown) => typeof v === 'string'))
  ) {
    errors.push('"referenceArchitectures" must be an array of strings if present');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, manifest: obj as unknown as ComponentManifest };
}

// ---------------------------------------------------------------------------
// Component discovery
// ---------------------------------------------------------------------------

/**
 * Recursively search for component.json files under the given root directory.
 * Returns the absolute paths to all directories containing a component.json.
 */
async function findComponentDirs(dir: string): Promise<string[]> {
  const results: string[] = [];

  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  // Check if this directory contains a component.json
  const hasManifest = entries.some((e) => e.isFile() && e.name === 'component.json');
  if (hasManifest) {
    results.push(dir);
    // Don't recurse further — a component directory is a leaf
    return results;
  }

  // Recurse into subdirectories (skip build artifacts and tooling dirs)
  const skipDirs = new Set(['node_modules', 'dist', '.git', '.turbo', 'coverage', 'bin', 'obj']);
  for (const entry of entries) {
    if (entry.isDirectory() && !skipDirs.has(entry.name)) {
      const sub = await findComponentDirs(join(dir, entry.name));
      results.push(...sub);
    }
  }

  return results;
}

/**
 * Discover all components under the given components root directory.
 *
 * Walks the tree, finds component.json files, parses and validates each one,
 * and returns an array of DiscoveredComponent objects.
 *
 * @param componentsRoot - Absolute path to the components/ directory.
 * @param repoRoot - Absolute path to the repository root (for computing relPath).
 * @returns Array of discovered components. Throws on validation errors.
 */
export async function discoverComponents(componentsRoot: string, repoRoot: string): Promise<DiscoveredComponent[]> {
  // Ensure the components directory exists
  try {
    const s = await stat(componentsRoot);
    if (!s.isDirectory()) {
      throw new Error(`Components path is not a directory: ${componentsRoot}`);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Components directory not found: ${componentsRoot}`);
    }
    throw err;
  }

  const componentDirs = await findComponentDirs(componentsRoot);

  if (componentDirs.length === 0) {
    throw new Error(`No component.json files found under ${componentsRoot}`);
  }

  const components: DiscoveredComponent[] = [];
  const validationErrors: string[] = [];

  for (const dir of componentDirs.sort()) {
    const manifestPath = join(dir, 'component.json');
    const raw = await readFile(manifestPath, 'utf-8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      validationErrors.push(`${manifestPath}: invalid JSON`);
      continue;
    }

    const result = validateManifest(parsed);
    if (!result.ok) {
      const prefix = relative(repoRoot, manifestPath);
      for (const err of result.errors) {
        validationErrors.push(`${prefix}: ${err}`);
      }
      continue;
    }

    components.push({
      manifest: result.manifest,
      dir,
      relPath: relative(repoRoot, dir)
    });
  }

  if (validationErrors.length > 0) {
    throw new Error(`Component manifest validation failed:\n${validationErrors.map((e) => `  - ${e}`).join('\n')}`);
  }

  return components;
}
