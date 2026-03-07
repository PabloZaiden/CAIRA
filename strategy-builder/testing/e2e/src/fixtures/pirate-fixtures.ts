/**
 * Canned pirate messages and expected response patterns for E2E tests.
 *
 * These fixtures provide:
 * - Sample user messages to send to the pirate API
 * - Expected response patterns for validating pirate-themed responses
 * - Schema names for OpenAPI validation
 * - SSE event type sequences
 */

// ─── User messages ──────────────────────────────────────────────────────

/** Sample user messages for parley tests */
export const PIRATE_MESSAGES = {
  /** Generic greeting — works for any activity mode */
  greeting: 'Ahoy there! What be happening?',
  /** Shanty-flavored message */
  shanty: 'Give me yer best verse, ye salty dog!',
  /** Treasure-flavored message */
  treasure: 'I see a cave ahead — should we explore it?',
  /** Crew-flavored message */
  crew: 'I can tie a bowline and swab the deck!',
  /** Short message for echo/regression tests */
  short: 'Arr!',
  /** Long message for stress tests */
  long: 'Tell me a long tale about your adventures on the seven seas, including every port you visited and every ship you plundered along the way.'
} as const;

// ─── Schema names (matching backend-api.openapi.yaml components/schemas) ─

export const SCHEMAS = {
  Adventure: 'Adventure',
  AdventureStarted: 'AdventureStarted',
  AdventureDetail: 'AdventureDetail',
  AdventureList: 'AdventureList',
  AdventureOutcome: 'AdventureOutcome',
  ParleyMessage: 'ParleyMessage',
  ActivityStats: 'ActivityStats',
  ModeStats: 'ModeStats',
  HealthResponse: 'HealthResponse',
  ErrorResponse: 'ErrorResponse',
  TokenUsage: 'TokenUsage'
} as const;

// ─── SSE event sequences ────────────────────────────────────────────────

/** Expected SSE event types for a successful streaming parley */
export const SSE_EVENT_SEQUENCE = {
  /** Events that must appear at least once (contractually guaranteed) */
  required: ['message.complete'] as const,
  /** Events that may optionally appear (model-dependent) */
  optional: ['message.delta', 'error', 'activity.resolved', 'tool.called', 'tool.done'] as const,
  /** Valid event types (anything else is unexpected) */
  valid: ['message.delta', 'message.complete', 'error', 'activity.resolved', 'tool.called', 'tool.done'] as const
} as const;

// ─── Error codes ────────────────────────────────────────────────────────

/** Expected error codes from the API */
export const ERROR_CODES = {
  notFound: 'not_found',
  badRequest: 'bad_request',
  agentError: 'agent_error',
  agentUnavailable: 'agent_unavailable',
  rateLimited: 'rate_limited',
  internalError: 'internal_error'
} as const;

// ─── Test IDs ───────────────────────────────────────────────────────────

/** An ID that definitely doesn't exist in any backend */
export const NON_EXISTENT_ADVENTURE_ID = 'nonexistent_adventure_000';
