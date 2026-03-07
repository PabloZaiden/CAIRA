/**
 * Shared types for the API container.
 *
 * These map to the schemas defined in contracts/backend-api.openapi.yaml
 * and contracts/agent-api.openapi.yaml.
 */

// ---------- Agent API types (what we receive from the agent container) ----------

export interface AgentConversation {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface AgentConversationList {
  readonly items: readonly AgentConversation[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
}

export interface AgentConversationDetail {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly messages: readonly AgentMessage[];
}

export interface AgentMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly createdAt: string;
  readonly usage?: TokenUsage | undefined;
  readonly resolution?: AgentResolution | undefined;
}

export interface AgentResolution {
  readonly tool: string;
  readonly result: Record<string, unknown>;
}

export interface TokenUsage {
  readonly promptTokens?: number | undefined;
  readonly completionTokens?: number | undefined;
}

export interface AgentHealthResponse {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly checks?: readonly AgentHealthCheck[] | undefined;
}

export interface AgentHealthCheck {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly latencyMs?: number | undefined;
}

export interface AgentErrorResponse {
  readonly error?:
    | {
        readonly code: string;
        readonly message: string;
      }
    | undefined;
  readonly code?: string | undefined;
  readonly message?: string | undefined;
}

// ---------- Business API types (what we return to the frontend) ----------

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
