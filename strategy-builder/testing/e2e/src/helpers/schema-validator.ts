/**
 * Schema validator — validates response bodies against OpenAPI 3.1.0 schemas.
 *
 * Loads the backend-api.openapi.yaml spec, resolves $ref pointers, and
 * validates JSON objects against named component schemas using ajv.
 */

import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Types ──────────────────────────────────────────────────────────────

interface OpenAPISpec {
  openapi: string;
  paths: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    responses?: Record<string, unknown>;
  };
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

// ─── Singleton spec loader ──────────────────────────────────────────────

let cachedSpec: OpenAPISpec | null = null;

/**
 * Load and cache the backend API spec.
 * Uses the contracts/backend-api.openapi.yaml relative to the repo root.
 */
async function loadSpec(specPath?: string | undefined): Promise<OpenAPISpec> {
  if (cachedSpec) return cachedSpec;

  const path = specPath ?? resolve(__dirname, '../../../../contracts/backend-api.openapi.yaml');
  const content = await readFile(path, 'utf-8');
  cachedSpec = YAML.parse(content) as OpenAPISpec;
  return cachedSpec;
}

/**
 * Recursively resolve all $ref pointers in a JSON schema object.
 */
function resolveRefs(obj: unknown, root: OpenAPISpec): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveRefs(item, root));
  }

  const record = obj as Record<string, unknown>;

  // Handle $ref
  if (typeof record['$ref'] === 'string') {
    const ref = record['$ref'];
    const resolved = resolveRefPointer(ref, root);
    return resolveRefs(resolved, root);
  }

  // Recursively resolve all properties
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = resolveRefs(value, root);
  }
  return result;
}

/**
 * Resolve a single $ref pointer (e.g., "#/components/schemas/StaffingMember").
 */
function resolveRefPointer(ref: string, root: OpenAPISpec): unknown {
  if (!ref.startsWith('#/')) {
    throw new Error(`External $ref not supported: ${ref}`);
  }

  const parts = ref.slice(2).split('/');
  let current: unknown = root;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      throw new Error(`Cannot resolve $ref "${ref}" — path not found at "${part}"`);
    }
    current = (current as Record<string, unknown>)[part];
  }

  if (current === undefined) {
    throw new Error(`Cannot resolve $ref "${ref}" — target not found`);
  }

  return current;
}

// ─── Public API ─────────────────────────────────────────────────────────

/**
 * Validate a response body against a named OpenAPI component schema.
 *
 * @param schemaName - Name of the schema in components/schemas (e.g., "StaffingMember")
 * @param data - The response body to validate
 * @param specPath - Optional path to the OpenAPI spec (defaults to backend-api.openapi.yaml)
 */
export async function validateSchema(
  schemaName: string,
  data: unknown,
  specPath?: string | undefined
): Promise<SchemaValidationResult> {
  const spec = await loadSpec(specPath);
  const schemas = spec.components?.schemas;

  if (!schemas) {
    return { valid: false, errors: ['No schemas found in spec'] };
  }

  const rawSchema = schemas[schemaName];
  if (!rawSchema) {
    return { valid: false, errors: [`Schema "${schemaName}" not found in spec`] };
  }

  // Resolve all $ref pointers
  const resolvedSchema = resolveRefs(rawSchema, spec);

  // Create ajv instance and validate
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const validate = ajv.compile(resolvedSchema as Record<string, unknown>);
  const valid = validate(data);

  if (valid) {
    return { valid: true, errors: [] };
  }

  const errors = (validate.errors ?? []).map((err: ErrorObject) => {
    const path = err.instancePath || '/';
    return `${path}: ${err.message ?? 'unknown error'}`;
  });

  return { valid: false, errors };
}

/**
 * Reset the cached spec (useful for testing with different specs).
 */
export function resetSchemaCache(): void {
  cachedSpec = null;
}
