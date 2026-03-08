/**
 * Shared types for the agent container.
 * Maps to contracts/agent-api.openapi.yaml schemas.
 */

export interface Conversation {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface ConversationList {
  readonly items: readonly Conversation[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
}

export interface ConversationDetail {
  readonly id: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata?: Record<string, unknown> | undefined;
  readonly messages: readonly Message[];
}

export interface Message {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly createdAt: string;
  readonly usage?: TokenUsage | undefined;
  readonly resolution?: ActivityResolution | undefined;
}

export interface ActivityResolution {
  readonly tool: string;
  readonly result: Record<string, unknown>;
}

export interface TokenUsage {
  readonly promptTokens?: number | undefined;
  readonly completionTokens?: number | undefined;
}

export interface HealthResponse {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly checks?: readonly HealthCheck[] | undefined;
}

export interface HealthCheck {
  readonly name: string;
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly latencyMs?: number | undefined;
}

export interface ErrorResponse {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown> | undefined;
}

// ---------- SSE event types for streaming ----------

export interface SSEDeltaEvent {
  readonly content: string;
}

export interface SSECompleteEvent {
  readonly messageId: string;
  readonly content: string;
  readonly usage?: TokenUsage | undefined;
}

export interface SSEErrorEvent {
  readonly code: string;
  readonly message: string;
}

export interface SSEResolvedEvent {
  readonly tool: string;
  readonly result: Record<string, unknown>;
}

export interface SSEToolCalledEvent {
  readonly toolName: string;
}

export interface SSEToolDoneEvent {
  readonly toolName: string;
}
