/**
 * Type definitions for the unified AI mock server.
 *
 * Combines three API surfaces:
 * 1. Agent CRUD — create/get/update/delete/list agents (Foundry Agent Service)
 * 2. Responses API — OpenAI Responses API (POST /responses, streaming, etc.)
 * 3. Conversations API — OpenAI Conversations API (server-side conversation state)
 *
 * The Responses API types are consumed by both the OpenAI Agents SDK (direct)
 * and the Foundry Agent Service SDK (via @azure/ai-projects → getOpenAIClient()).
 */

// ============================================================
// Agent CRUD types (Foundry Agent Service)
// ============================================================

/** Function tool definition for agent creation */
export interface FunctionToolDef {
  type: 'function';
  name: string;
  description?: string;
  parameters: Record<string, unknown>;
  strict?: boolean;
}

/** Agent definition body (for create/update) */
export interface PromptAgentDefinition {
  kind: 'prompt';
  model: string;
  instructions?: string | undefined;
  tools?: FunctionToolDef[] | undefined;
}

/** Agent version (stored within the agent) */
export interface AgentVersion {
  model: string;
  instructions: string;
  tools: FunctionToolDef[];
}

/** The agent object returned by the API */
export interface Agent {
  object: 'agent';
  id: string;
  name: string;
  versions: {
    latest: AgentVersion;
  };
  created_at: number;
}

/** Paginated list response for agents */
export interface AgentListResponse {
  object: 'list';
  data: Agent[];
  has_more: boolean;
}

// ============================================================
// Responses API types
// ============================================================

/** The top-level response object */
export interface Response {
  id: string;
  object: 'response';
  status: ResponseStatus;
  model: string;
  output: OutputItem[];
  output_text: string;
  usage: ResponseUsage;
  created_at: number;
  error: ResponseError | null;
  metadata: Record<string, string>;
  /** Used by agent loop for conversation continuity */
  previous_response_id: string | null;
}

export type ResponseStatus = 'completed' | 'failed' | 'in_progress' | 'cancelled';

/** A single output item in the response */
export type OutputItem = TextOutputItem | FunctionCallOutputItem;

export interface TextOutputItem {
  type: 'message';
  id: string;
  role: 'assistant';
  status: 'in_progress' | 'completed' | 'incomplete';
  content: TextContent[];
}

export interface TextContent {
  type: 'output_text';
  text: string;
}

export interface FunctionCallOutputItem {
  type: 'function_call';
  id: string;
  call_id: string;
  name: string;
  arguments: string;
  status?: 'in_progress' | 'completed' | 'incomplete' | undefined;
}

/** Content part sent by the SDK when content is an array */
export interface InputTextContentPart {
  type: 'input_text';
  text: string;
}

/** Content can be a plain string or an array of content parts */
export type UserInputContent = string | InputTextContentPart[];

/** Input items for follow-up requests */
export type InputItem = UserInputItem | MinimalUserInputItem | FunctionCallOutputInputItem;

/**
 * Full user input item (with explicit type: 'message').
 * Sent by the SDK's `user()` helper and by explicit test payloads.
 */
export interface UserInputItem {
  type: 'message';
  role: 'user';
  content: UserInputContent;
}

/**
 * Minimal user input item WITHOUT the `type` field.
 * The @openai/agents SDK's `getInputItems()` converts a plain string input
 * into `[{ role: 'user', content: 'Hello' }]` — note: no `type` property.
 */
export interface MinimalUserInputItem {
  role: 'user';
  content: UserInputContent;
}

export interface FunctionCallOutputInputItem {
  type: 'function_call_output';
  call_id: string;
  output: string;
}

/** Tool definition in request */
export interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** Usage info */
export interface ResponseUsage {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/** Error shape */
export interface ResponseError {
  code: string;
  message: string;
}

/** Request body for POST /responses */
export interface CreateResponseRequest {
  model?: string | undefined;
  input: string | InputItem[];
  instructions?: string | undefined;
  tools?: ToolDefinition[] | undefined;
  stream?: boolean | undefined;
  previous_response_id?: string | undefined;
  /** Server-side conversation context (mutually exclusive with previous_response_id) */
  conversation?: string | ConversationParam | undefined;
  metadata?: Record<string, string> | undefined;
}

/** Conversation parameter for responses.create() */
export interface ConversationParam {
  id: string;
}

// ============================================================
// Conversations API types
// ============================================================

/** The conversation object returned by the API */
export interface Conversation {
  id: string;
  object: 'conversation';
  created_at: number;
  metadata: Record<string, string> | null;
}

/** Response from deleting a conversation */
export interface ConversationDeleted {
  id: string;
  object: 'conversation.deleted';
  deleted: true;
}

/**
 * A conversation item — stored input/output items within a conversation.
 * Items are automatically accumulated when responses.create() is called
 * with a conversation parameter.
 */
export type ConversationItem = ConversationInputItem | ConversationOutputItem;

/** An input item stored in a conversation (user messages, tool outputs) */
export interface ConversationInputItem {
  type: 'message' | 'function_call_output';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** An output item stored in a conversation (assistant messages, function calls) */
export interface ConversationOutputItem {
  type: 'message' | 'function_call';
  role?: 'assistant';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
