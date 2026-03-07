/**
 * Core contract compliance validator.
 *
 * Sends requests to a running service and validates responses against
 * OpenAPI 3.1.0 schemas using ajv.
 */

import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { readFile } from 'node:fs/promises';
import YAML from 'yaml';
import { type OpenAPISpec, parseSpec, resolveAllRefs } from './parser.ts';
import type { ContractResult, ParsedOperation, SSEEvent, ValidateOptions } from './types.ts';

/**
 * Validate a running service against its OpenAPI spec.
 *
 * For each endpoint defined in the spec, constructs a request, sends it,
 * and validates the response status, headers, and body against the spec schemas.
 *
 * @param specPath - Path to the OpenAPI 3.1.0 YAML or JSON file
 * @param baseUrl - Base URL of the running service (e.g., "http://localhost:3000")
 * @param options - Validation options (bearer token, timeout, overrides, etc.)
 * @returns Array of ContractResult, one per endpoint/status-code combination tested
 */
export async function validateContract(
  specPath: string,
  baseUrl: string,
  options?: ValidateOptions
): Promise<ContractResult[]> {
  const operations = await parseSpec(specPath);

  // Load the raw spec for $ref resolution when building ajv schemas
  const rawContent = await readFile(specPath, 'utf-8');
  const spec: OpenAPISpec = specPath.endsWith('.json')
    ? (JSON.parse(rawContent) as OpenAPISpec)
    : (YAML.parse(rawContent) as OpenAPISpec);

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  const results: ContractResult[] = [];

  // Filter out skipped paths if specified
  const skipSet = new Set(options?.skipPaths ?? []);
  const filteredOps = skipSet.size > 0 ? operations.filter((op) => !skipSet.has(op.path)) : operations;

  for (const op of filteredOps) {
    const result = await validateOperation(op, baseUrl, spec, ajv, options);
    results.push(...result);
  }

  return results;
}

/**
 * Validate a single operation against a running service.
 *
 * Returns one ContractResult per response status code that was actually tested.
 * We only test the "success" path (lowest 2xx status code) plus SSE if applicable.
 * Error codes (4xx, 5xx) are not actively tested — they require specific preconditions
 * that the caller can set up via requestBodies/pathParams overrides.
 */
async function validateOperation(
  op: ParsedOperation,
  baseUrl: string,
  spec: OpenAPISpec,
  ajv: InstanceType<typeof Ajv>,
  options?: ValidateOptions
): Promise<ContractResult[]> {
  const results: ContractResult[] = [];
  const timeout = options?.requestTimeout ?? 5000;

  // Find the success status code to test (lowest 2xx)
  const successCodes = [...op.responses.keys()].filter((code) => code >= 200 && code < 300).sort((a, b) => a - b);

  if (successCodes.length === 0) {
    // No success response defined — skip this operation
    return results;
  }

  // Build the request URL
  const url = buildUrl(baseUrl, op, options);

  // Build request headers
  const headers: Record<string, string> = {
    ...(options?.headers ?? {})
  };
  if (options?.bearerToken) {
    headers['Authorization'] = `Bearer ${options.bearerToken}`;
  }

  // If this endpoint supports SSE and SSE validation is not disabled,
  // test SSE first with Accept: text/event-stream
  if (op.supportsSSE && (options?.validateSSE ?? true)) {
    const sseResult = await validateSSEEndpoint(op, url, headers, timeout, options);
    results.push(sseResult);
  }

  // Test the JSON success path
  const successCode = successCodes[0];
  if (successCode === undefined) {
    return results;
  }

  const responseSchema = op.responses.get(successCode);

  // For SSE-only endpoints, if we already tested SSE and there's no JSON response,
  // we're done
  if (op.supportsSSE && !responseSchema?.schema && responseSchema?.contentType === 'text/event-stream') {
    return results;
  }

  // Set Accept header for JSON
  headers['Accept'] = 'application/json';

  // Build request body
  let body: string | null = null;
  if (op.requestBodySchema) {
    const overrideBody = options?.requestBodies?.[op.operationId];
    if (overrideBody !== undefined) {
      body = JSON.stringify(overrideBody);
      headers['Content-Type'] = 'application/json';
    } else if (op.requestBodyRequired) {
      // Generate a minimal valid body from the schema
      body = JSON.stringify(generateMinimalBody(op.requestBodySchema));
      headers['Content-Type'] = 'application/json';
    }
  }

  const start = performance.now();
  let result: ContractResult;

  try {
    const response = await fetch(url, {
      method: op.method,
      headers,
      body,
      signal: AbortSignal.timeout(timeout)
    });

    const durationMs = Math.round(performance.now() - start);
    const errors: string[] = [];

    // Validate status code
    if (response.status !== successCode) {
      errors.push(`Expected status ${String(successCode)}, got ${String(response.status)}`);
    }

    // Validate response body against schema
    if (responseSchema?.schema && response.headers.get('content-type')?.includes('application/json')) {
      try {
        const responseBody: unknown = await response.json();
        const resolvedSchema = resolveAllRefs(responseSchema.schema, spec);
        const validate: ValidateFunction = ajv.compile(resolvedSchema as object);
        const valid = validate(responseBody);
        if (!valid && validate.errors) {
          for (const err of validate.errors) {
            errors.push(`Schema validation: ${err.instancePath || '/'} ${err.message ?? 'unknown error'}`);
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        errors.push(`Failed to parse/validate response body: ${message}`);
      }
    } else {
      // Consume the body to avoid connection leaks
      await response.text();
    }

    result = {
      path: op.path,
      method: op.method,
      expectedStatus: successCode,
      actualStatus: response.status,
      passed: errors.length === 0,
      errors,
      durationMs
    };
  } catch (e: unknown) {
    const durationMs = Math.round(performance.now() - start);
    const message = e instanceof Error ? e.message : String(e);
    result = {
      path: op.path,
      method: op.method,
      expectedStatus: successCode,
      actualStatus: 0,
      passed: false,
      errors: [`Request failed: ${message}`],
      durationMs
    };
  }

  results.push(result);
  return results;
}

/**
 * Validate an SSE streaming endpoint.
 *
 * Connects with Accept: text/event-stream, collects events, and validates:
 * 1. Response content-type is text/event-stream
 * 2. Events arrive in SSE format (event: ... / data: ...)
 * 3. At least one event is received before the stream ends
 */
async function validateSSEEndpoint(
  op: ParsedOperation,
  url: string,
  baseHeaders: Record<string, string>,
  timeout: number,
  options?: ValidateOptions
): Promise<ContractResult> {
  const headers: Record<string, string> = {
    ...baseHeaders,
    Accept: 'text/event-stream'
  };

  // Build request body for SSE (same as JSON path)
  let body: string | null = null;
  if (op.requestBodySchema) {
    const overrideBody = options?.requestBodies?.[op.operationId];
    if (overrideBody !== undefined) {
      body = JSON.stringify(overrideBody);
      headers['Content-Type'] = 'application/json';
    } else if (op.requestBodyRequired) {
      body = JSON.stringify(generateMinimalBody(op.requestBodySchema));
      headers['Content-Type'] = 'application/json';
    }
  }

  const start = performance.now();
  const errors: string[] = [];
  let actualStatus = 0;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    const response = await fetch(url, {
      method: op.method,
      headers,
      body,
      signal: controller.signal
    });

    actualStatus = response.status;

    // Check content-type
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/event-stream')) {
      errors.push(`Expected content-type text/event-stream, got ${contentType}`);
      // Consume body
      await response.text();
      clearTimeout(timeoutId);
    } else {
      // Parse SSE events
      const events = await collectSSEEvents(response, timeout);
      clearTimeout(timeoutId);

      if (events.length === 0) {
        errors.push('No SSE events received before stream ended');
      }

      // Validate event format — each event should have a non-empty event name
      for (let i = 0; i < events.length; i++) {
        const evt = events[i];
        if (evt === undefined) continue;
        if (!evt.event) {
          errors.push(`SSE event #${String(i)} has no event name`);
        }
      }
    }
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    // AbortError from timeout is acceptable if we received some data
    if (!(e instanceof DOMException && e.name === 'AbortError')) {
      errors.push(`SSE request failed: ${message}`);
    }
  }

  const durationMs = Math.round(performance.now() - start);

  // SSE endpoints typically return 200
  const expectedStatus =
    [...op.responses.keys()].filter((code) => code >= 200 && code < 300).sort((a, b) => a - b)[0] ?? 200;

  if (actualStatus !== 0 && actualStatus !== expectedStatus) {
    errors.push(`Expected status ${String(expectedStatus)}, got ${String(actualStatus)}`);
  }

  return {
    path: `${op.path} [SSE]`,
    method: op.method,
    expectedStatus,
    actualStatus,
    passed: errors.length === 0,
    errors,
    durationMs
  };
}

/**
 * Collect SSE events from a fetch response body stream.
 * Reads the stream until it closes or the timeout is reached.
 */
async function collectSSEEvents(response: Response, timeout: number): Promise<SSEEvent[]> {
  const events: SSEEvent[] = [];
  const body = response.body;
  if (!body) return events;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const deadline = Date.now() + timeout;

  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Parse complete events from buffer (separated by double newline)
      const parts = buffer.split('\n\n');
      // The last part might be incomplete
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        const event = parseSSEEvent(part);
        if (event) {
          events.push(event);
        }
      }
    }

    // Parse any remaining buffer
    if (buffer.trim()) {
      const event = parseSSEEvent(buffer);
      if (event) {
        events.push(event);
      }
    }
  } catch {
    // Stream interrupted — that's OK for SSE
  } finally {
    reader.releaseLock();
  }

  return events;
}

/**
 * Parse a single SSE event block into an SSEEvent object.
 *
 * Format:
 *   event: eventName
 *   data: {"key": "value"}
 */
function parseSSEEvent(block: string): SSEEvent | null {
  const lines = block.split('\n');
  let event = '';
  let data = '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
    } else if (line.startsWith('data:')) {
      data = line.slice('data:'.length).trim();
    }
    // Ignore id:, retry:, comments (lines starting with :)
  }

  if (!event && !data) return null;

  return { event, data };
}

/**
 * Build the full URL for a request, substituting path parameters
 * and adding query parameters.
 */
function buildUrl(baseUrl: string, op: ParsedOperation, options?: ValidateOptions): string {
  // Substitute path parameters
  let path = op.path;
  for (const param of op.pathParams) {
    const value = options?.pathParams?.[param.name] ?? generateParamValue(param.schema);
    path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
  }

  const url = new URL(path, baseUrl);

  // Add query parameters (only required ones by default)
  for (const param of op.queryParams) {
    if (param.required) {
      const value = generateParamValue(param.schema);
      url.searchParams.set(param.name, String(value));
    }
  }

  return url.toString();
}

/**
 * Generate a minimal valid request body from a JSON Schema.
 *
 * Produces an object with only the required properties set to
 * sensible defaults based on their types.
 */
function generateMinimalBody(schema: unknown): unknown {
  if (schema === null || schema === undefined) return {};
  if (typeof schema !== 'object') return {};

  const s = schema as Record<string, unknown>;
  const type = s['type'] as string | undefined;

  if (type === 'object') {
    const result: Record<string, unknown> = {};
    const required = (s['required'] as string[] | undefined) ?? [];
    const properties = (s['properties'] as Record<string, unknown> | undefined) ?? {};

    for (const prop of required) {
      const propSchema = properties[prop];
      if (propSchema !== undefined) {
        result[prop] = generateDefaultValue(propSchema);
      }
    }

    return result;
  }

  return generateDefaultValue(schema);
}

/**
 * Generate a default value for a JSON Schema type.
 */
function generateDefaultValue(schema: unknown): unknown {
  if (schema === null || schema === undefined) return null;
  if (typeof schema !== 'object') return null;

  const s = schema as Record<string, unknown>;
  const type = s['type'] as string | undefined;
  const format = s['format'] as string | undefined;
  const enumValues = s['enum'] as unknown[] | undefined;

  // If there's an enum, use the first value
  if (enumValues && enumValues.length > 0) {
    return enumValues[0];
  }

  switch (type) {
    case 'string': {
      if (format === 'uuid') return '00000000-0000-0000-0000-000000000000';
      if (format === 'date-time') return new Date().toISOString();
      if (format === 'email') return 'test@example.com';
      if (format === 'uri') return 'https://example.com';
      const minLength = (s['minLength'] as number | undefined) ?? 0;
      return minLength > 0 ? 'test' : '';
    }
    case 'number':
    case 'integer': {
      const minimum = (s['minimum'] as number | undefined) ?? 0;
      return minimum;
    }
    case 'boolean':
      return false;
    case 'array': {
      // Return an empty array — or one item if minItems > 0
      const minItems = (s['minItems'] as number | undefined) ?? 0;
      if (minItems > 0 && s['items']) {
        return Array.from({ length: minItems }, () => generateDefaultValue(s['items']));
      }
      return [];
    }
    case 'object':
      return generateMinimalBody(s);
    default:
      return null;
  }
}

/**
 * Generate a default value for a query/path parameter schema.
 */
function generateParamValue(schema: unknown): string | number | boolean {
  const value = generateDefaultValue(schema);
  if (value === null || value === undefined) return 'test';
  if (typeof value === 'object') return 'test';
  return value as string | number | boolean;
}
