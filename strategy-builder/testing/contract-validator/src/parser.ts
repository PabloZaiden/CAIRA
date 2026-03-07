/**
 * OpenAPI 3.1.0 spec parser — extracts operations with their schemas.
 */

import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import type { ParsedOperation, ParsedParameter, ResponseSchema } from './types.ts';

/** Raw OpenAPI spec shape (minimal typing for what we need) */
export interface OpenAPISpec {
  openapi: string;
  paths: Record<string, PathItem>;
  components?: {
    schemas?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    responses?: Record<string, unknown>;
  };
}

interface PathItem {
  parameters?: unknown[];
  [method: string]: unknown;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'] as const;

/**
 * Parse an OpenAPI 3.1.0 spec file (YAML or JSON) into a list of operations.
 */
export async function parseSpec(specPath: string): Promise<ParsedOperation[]> {
  const content = await readFile(specPath, 'utf-8');
  const spec: OpenAPISpec = specPath.endsWith('.json')
    ? (JSON.parse(content) as OpenAPISpec)
    : (YAML.parse(content) as OpenAPISpec);

  if (!spec.openapi?.startsWith('3.1')) {
    throw new Error(`Unsupported OpenAPI version: ${String(spec.openapi)}. Only 3.1.x is supported.`);
  }

  if (!spec.paths || typeof spec.paths !== 'object') {
    throw new Error('OpenAPI spec has no paths defined.');
  }

  const operations: ParsedOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    // Path-level parameters apply to all operations under this path
    const pathLevelParams = resolveParams((pathItem.parameters as unknown[] | undefined) ?? [], spec);

    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as Record<string, unknown> | undefined;
      if (!operation) continue;

      const operationId = (operation['operationId'] as string | undefined) ?? `${method.toUpperCase()} ${path}`;

      // Merge path-level and operation-level parameters
      const opParams = resolveParams((operation['parameters'] as unknown[] | undefined) ?? [], spec);
      const allParams = [...pathLevelParams, ...opParams];

      const pathParams = allParams.filter((p) => p.location === 'path');
      const queryParams = allParams.filter((p) => p.location === 'query');

      // Parse request body
      let requestBodySchema: unknown = undefined;
      let requestBodyRequired = false;
      const requestBody = operation['requestBody'] as Record<string, unknown> | undefined;
      if (requestBody) {
        const resolved = resolveRef(requestBody, spec) as Record<string, unknown>;
        requestBodyRequired = (resolved['required'] as boolean) ?? false;
        const content = resolved['content'] as Record<string, unknown> | undefined;
        if (content?.['application/json']) {
          const jsonContent = content['application/json'] as Record<string, unknown>;
          requestBodySchema = resolveRef(jsonContent['schema'] as Record<string, unknown>, spec);
        }
      }

      // Parse responses
      const responses = new Map<number, ResponseSchema>();
      let supportsSSE = false;

      const rawResponses = (operation['responses'] as Record<string, unknown>) ?? {};
      for (const [statusStr, responseObj] of Object.entries(rawResponses)) {
        const statusCode = parseInt(statusStr, 10);
        if (isNaN(statusCode)) continue;

        const resolved = resolveRef(responseObj as Record<string, unknown>, spec) as Record<string, unknown>;
        const description = (resolved['description'] as string) ?? '';
        const content = resolved['content'] as Record<string, unknown> | undefined;

        if (content?.['text/event-stream']) {
          supportsSSE = true;
        }

        // Prefer JSON schema for validation
        let schema: unknown = undefined;
        let contentType: string | undefined;

        if (content?.['application/json']) {
          const jsonContent = content['application/json'] as Record<string, unknown>;
          schema = resolveRef(jsonContent['schema'] as Record<string, unknown>, spec);
          contentType = 'application/json';
        } else if (content?.['text/plain']) {
          contentType = 'text/plain';
        } else if (content?.['text/event-stream']) {
          contentType = 'text/event-stream';
        }

        responses.set(statusCode, {
          statusCode,
          description,
          contentType,
          schema
        });
      }

      const tags = (operation['tags'] as string[] | undefined) ?? [];

      operations.push({
        operationId,
        method: method.toUpperCase(),
        path,
        pathParams,
        queryParams,
        requestBodySchema,
        requestBodyRequired,
        responses,
        supportsSSE,
        tags
      });
    }
  }

  return operations;
}

/**
 * Resolve an array of parameter objects (handling $ref).
 */
function resolveParams(params: unknown[], spec: OpenAPISpec): ParsedParameter[] {
  return params.map((p) => {
    const resolved = resolveRef(p as Record<string, unknown>, spec) as Record<string, unknown>;
    return {
      name: resolved['name'] as string,
      required: (resolved['required'] as boolean) ?? false,
      schema: resolved['schema'],
      location: resolved['in'] as 'path' | 'query' | 'header'
    };
  });
}

/**
 * Resolve a $ref pointer to the actual object in the spec.
 * Only handles internal references (#/components/...).
 */
export function resolveRef(obj: Record<string, unknown> | undefined, spec: OpenAPISpec): unknown {
  if (!obj) return obj;
  if (!('$ref' in obj)) return obj;

  const ref = obj['$ref'] as string;
  if (!ref.startsWith('#/')) {
    throw new Error(`External $ref not supported: ${ref}`);
  }

  const parts = ref.slice(2).split('/');
  let current: unknown = spec;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') break;
    current = (current as Record<string, unknown>)[part];
  }

  if (current === undefined) {
    throw new Error(`Could not resolve $ref: ${ref}`);
  }

  // Recursively resolve nested refs
  if (typeof current === 'object' && current !== null && '$ref' in (current as Record<string, unknown>)) {
    return resolveRef(current as Record<string, unknown>, spec);
  }

  return current;
}

/**
 * Recursively resolve all $ref pointers in a schema object.
 * Returns a deep copy with all refs inlined (for ajv validation).
 */
export function resolveAllRefs(schema: unknown, spec: OpenAPISpec): unknown {
  if (schema === null || schema === undefined) return schema;
  if (typeof schema !== 'object') return schema;

  if (Array.isArray(schema)) {
    return schema.map((item) => resolveAllRefs(item, spec));
  }

  const obj = schema as Record<string, unknown>;

  // Resolve $ref first
  if ('$ref' in obj) {
    const resolved = resolveRef(obj, spec);
    return resolveAllRefs(resolved, spec);
  }

  // Recurse into all properties
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[key] = resolveAllRefs(value, spec);
  }
  return result;
}
