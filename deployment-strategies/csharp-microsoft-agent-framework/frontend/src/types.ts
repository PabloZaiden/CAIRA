/**
 * Frontend type definitions.
 *
 * These mirror the business API types defined in contracts/backend-api.openapi.yaml
 * and returned by the API container (components/api/typescript/src/types.ts).
 */

// ---------- Adventure types ----------

export type AdventureMode = 'shanty' | 'treasure' | 'crew';

export type AdventureStatus = 'active' | 'resolved';

export interface AdventureOutcome {
  readonly tool: string;
  readonly result: Record<string, unknown>;
}

export interface Adventure {
  readonly id: string;
  readonly mode: AdventureMode;
  readonly status: AdventureStatus;
  readonly outcome?: AdventureOutcome | undefined;
  readonly createdAt: string;
  readonly lastParleyAt: string;
  readonly messageCount: number;
}

export interface AdventureStarted {
  readonly id: string;
  readonly mode: AdventureMode;
  readonly status: AdventureStatus;
  readonly syntheticMessage: string;
  readonly createdAt: string;
}

export interface AdventureDetail {
  readonly id: string;
  readonly mode: AdventureMode;
  readonly status: AdventureStatus;
  readonly outcome?: AdventureOutcome | undefined;
  readonly createdAt: string;
  readonly lastParleyAt: string;
  readonly messageCount: number;
  readonly parleys: readonly ParleyMessage[];
}

export interface AdventureList {
  readonly adventures: readonly Adventure[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
}

export interface ParleyMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly createdAt: string;
  readonly usage?: TokenUsage | undefined;
  readonly resolution?: AdventureOutcome | undefined;
}

export interface TokenUsage {
  readonly promptTokens?: number | undefined;
  readonly completionTokens?: number | undefined;
}

export interface ModeStats {
  readonly total: number;
  readonly active: number;
  readonly resolved: number;
}

export interface ActivityStats {
  readonly totalAdventures: number;
  readonly activeAdventures: number;
  readonly resolvedAdventures: number;
  readonly byMode: {
    readonly shanty: ModeStats;
    readonly treasure: ModeStats;
    readonly crew: ModeStats;
  };
}

export interface HealthResponse {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly dependencies?: readonly DependencyHealth[] | undefined;
}

export interface DependencyHealth {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly latencyMs?: number | undefined;
}

export interface ErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown> | undefined;
}

// ---------- SSE event types (for streaming parley) ----------

export type SSEEvent =
  | { readonly type: 'delta'; readonly content: string }
  | { readonly type: 'complete'; readonly message: ParleyMessage }
  | { readonly type: 'error'; readonly code: string; readonly message: string }
  | { readonly type: 'activity.resolved'; readonly outcome: AdventureOutcome }
  | { readonly type: 'tool.called'; readonly toolName: string }
  | { readonly type: 'tool.done'; readonly toolName: string };
