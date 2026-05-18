/**
 * Types for the contract compliance validator.
 */

/** Options for validateContract() */
export interface ValidateOptions {
  /** Bearer token for Authorization header (optional — mocks may not require it) */
  bearerToken?: string;
  /** Timeout in ms for each request (default: 5000) */
  requestTimeout?: number;
  /** Whether to validate SSE streaming endpoints (default: true) */
  validateSSE?: boolean;
  /** Additional headers to send with every request */
  headers?: Record<string, string>;
  /** Request body overrides keyed by operationId */
  requestBodies?: Record<string, unknown>;
  /** Path parameter overrides keyed by parameter name */
  pathParams?: Record<string, string>;
  /**
   * Path patterns to skip (exact path template match).
   * E.g., ["/conversations/{conversationId}"] skips GET and POST on that path.
   */
  skipPaths?: string[];
}

/** Result of validating a single endpoint */
export interface ContractResult {
  /** The path template from the spec (e.g., /conversations/{conversationId}) */
  path: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** The expected status code we were testing */
  expectedStatus: number;
  /** The actual status code returned */
  actualStatus: number;
  /** Whether this endpoint passed validation */
  passed: boolean;
  /** Validation errors (empty if passed) */
  errors: string[];
  /** Time taken in ms */
  durationMs: number;
}

/** Parsed OpenAPI operation with resolved details */
export interface ParsedOperation {
  /** operationId from the spec */
  operationId: string;
  /** HTTP method */
  method: string;
  /** Path template (e.g., /conversations/{conversationId}) */
  path: string;
  /** Path parameters defined in the spec */
  pathParams: ParsedParameter[];
  /** Query parameters defined in the spec */
  queryParams: ParsedParameter[];
  /** Request body schema (if any) */
  requestBodySchema?: unknown;
  /** Whether request body is required */
  requestBodyRequired: boolean;
  /** Map of status code -> response schema */
  responses: Map<number, ResponseSchema>;
  /** Whether this endpoint supports SSE (text/event-stream) */
  supportsSSE: boolean;
  /** Tags for this operation */
  tags: string[];
}

/** A parsed parameter from the spec */
export interface ParsedParameter {
  name: string;
  required: boolean;
  schema: unknown;
  location: 'path' | 'query' | 'header';
}

/** Response schema for a given status code */
export interface ResponseSchema {
  statusCode: number;
  description: string;
  contentType?: string | undefined;
  schema?: unknown;
}

/** SSE event parsed from a stream */
export interface SSEEvent {
  event: string;
  data: string;
}
