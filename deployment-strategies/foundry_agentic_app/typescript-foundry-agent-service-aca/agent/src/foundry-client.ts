/**
 * Azure AI Foundry client — server-side agents + conversations.
 *
 * Uses @azure/ai-projects v2 SDK for:
 *   - Agent registration: project.agents.createVersion() registers three
 *     specialist agents server-side with their tools and instructions
 *   - OpenAI client: project.getOpenAIClient() provides an authenticated client
 *
 * Uses the OpenAI Conversations API for:
 *   - Server-side conversation state: openai.conversations.create() replaces
 *     client-side Map + previousResponseId chaining
 *   - Responses with conversation context: responses.create({ conversation })
 *
 * Discrete specialist setup:
 *   - Each activity mode maps to a single registered specialist agent
 *   - Each specialist exposes one local knowledge tool plus one resolution tool
 *   - The selected specialist is the user-facing conversational backend
 *
 * When a knowledge tool is called, the handler returns deterministic local
 * sample data. When a resolution tool is called, the handler captures the
 * structured result and the streaming layer emits an `activity.resolved`
 * SSE event.
 *
 * Authentication branching:
 *   - http:// endpoint + SKIP_AUTH: uses a plain OpenAI client with API key
 *   - https:// endpoint: uses AIProjectClient with Azure credentials
 *   In both cases the same code path is used for conversations and responses.
 */

import type { AzureMonitorOpenTelemetryOptions } from '@azure/monitor-opentelemetry';
import { useAzureMonitor } from '@azure/monitor-opentelemetry';
import { context, trace } from '@opentelemetry/api';

import OpenAIClient from 'openai';
import type OpenAI from 'openai';
import type {
  FunctionTool,
  ResponseCreateParamsNonStreaming,
  ResponseInputItem,
  ResponseOutputMessage,
  ResponseFunctionToolCall
} from 'openai/resources/responses/responses';
import type { ResponseCreateAndStreamParams } from 'openai/lib/responses/ResponseStream';
import { AIProjectClient } from '@azure/ai-projects';
import type { Agent } from '@azure/ai-projects';
import type { Config } from './config.ts';
import { createAzureCredential } from './azure-credential.ts';
import { lookupCrewKnowledge, lookupShantyKnowledge, lookupTreasureKnowledge } from './knowledge-base.ts';
import type {
  Conversation,
  ConversationDetail,
  ConversationList,
  Message,
  ActivityResolution,
  TokenUsage,
  HealthResponse,
  SSEDeltaEvent,
  SSECompleteEvent,
  SSEResolvedEvent,
  SSEToolCalledEvent,
  SSEToolDoneEvent
} from './types.ts';
import { setupTelemetry } from './telemetry.ts';

// ---------------------------------------------------------------------------
// Logger interface (subset of Pino used by this module)
// ---------------------------------------------------------------------------

export interface Logger {
  debug(obj: Record<string, unknown>, msg: string): void;
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** No-op logger used when no logger is provided. */
const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLogger;
  }
};

// ---------------------------------------------------------------------------
// Resolution tool schemas (JSON Schema for the Responses API function tools)
// ---------------------------------------------------------------------------

const RESOLVE_SHANTY_SCHEMA = {
  type: 'object',
  properties: {
    winner: {
      type: 'string',
      enum: ['user', 'pirate', 'draw'],
      description: 'Who won the shanty battle'
    },
    rounds: { type: 'number', description: 'Number of rounds completed' },
    best_verse: { type: 'string', description: 'The single best verse from the entire battle' }
  },
  required: ['winner', 'rounds', 'best_verse'],
  additionalProperties: false
} as const;

const RESOLVE_TREASURE_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'Whether the treasure was found' },
    treasure_name: { type: 'string', description: 'Name of the treasure' },
    location: { type: 'string', description: 'Where the treasure was found or lost' }
  },
  required: ['found', 'treasure_name', 'location'],
  additionalProperties: false
} as const;

const RESOLVE_CREW_SCHEMA = {
  type: 'object',
  properties: {
    rank: {
      type: 'string',
      description: 'The assigned rank (e.g., Able Seaman, Quartermaster)'
    },
    role: {
      type: 'string',
      description: 'The assigned role (e.g., lookout, cook, navigator)'
    },
    ship_name: {
      type: 'string',
      description: 'The name of the ship they are joining'
    }
  },
  required: ['rank', 'role', 'ship_name'],
  additionalProperties: false
} as const;

// ---------------------------------------------------------------------------
// Specialist tool schemas (thin wrappers — the captain passes a description
// of what content to generate, we route it to the specialist agent)
// ---------------------------------------------------------------------------

const SPECIALIST_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    request: {
      type: 'string',
      description: 'Description of the content to generate'
    }
  },
  required: ['request'],
  additionalProperties: false
} as const;

// ---------------------------------------------------------------------------
// Tool definitions for the Responses API
// ---------------------------------------------------------------------------

const TOOL_DEFINITIONS: readonly FunctionTool[] = [
  {
    type: 'function',
    name: 'lookup_shanty_knowledge',
    description: 'Retrieve sample shanty references, motifs, and battle cues.',
    parameters: SPECIALIST_INPUT_SCHEMA,
    strict: true
  },
  {
    type: 'function',
    name: 'lookup_treasure_knowledge',
    description: 'Retrieve sample treasure lore, locations, and clues.',
    parameters: SPECIALIST_INPUT_SCHEMA,
    strict: true
  },
  {
    type: 'function',
    name: 'lookup_crew_knowledge',
    description: 'Retrieve sample crew roles, ranks, and qualifications.',
    parameters: SPECIALIST_INPUT_SCHEMA,
    strict: true
  },
  // Resolution tools
  {
    type: 'function',
    name: 'resolve_shanty',
    description: 'Call this when the Sea Shanty Battle concludes. Declares the winner and records the outcome.',
    parameters: RESOLVE_SHANTY_SCHEMA,
    strict: true
  },
  {
    type: 'function',
    name: 'resolve_treasure',
    description: 'Call this when the Treasure Hunt concludes. Records whether treasure was found and details.',
    parameters: RESOLVE_TREASURE_SCHEMA,
    strict: true
  },
  {
    type: 'function',
    name: 'resolve_crew',
    description: 'Call this when the crew interview concludes. Assigns a rank and role to the new crew member.',
    parameters: RESOLVE_CREW_SCHEMA,
    strict: true
  }
] as const;

const KNOWLEDGE_TOOLS = new Set(['lookup_shanty_knowledge', 'lookup_treasure_knowledge', 'lookup_crew_knowledge']);

/** Resolution tool names. */
const RESOLUTION_TOOLS = new Set(['resolve_shanty', 'resolve_treasure', 'resolve_crew']);

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/**
 * Detect a 404 "not found" error from the Azure REST SDK.
 * The SDK throws a RestError with `statusCode: 404` when a resource
 * doesn't exist.
 */
function isNotFoundError(err: unknown): boolean {
  if (typeof err === 'object' && err !== null && 'statusCode' in err) {
    return (err as { statusCode: unknown }).statusCode === 404;
  }
  return false;
}

interface CapturedResolution {
  tool: string;
  result: Record<string, unknown>;
}

function shouldEmitLifecycleEvents(metadata: Record<string, unknown> | undefined): boolean {
  const mode = metadata?.['mode'];
  return mode === 'shanty' || mode === 'treasure' || mode === 'crew';
}

/**
 * Conversation record — maps our local ID to the server-side conversation ID
 * from the OpenAI Conversations API.
 */
interface ConversationRecord {
  /** Server-side conversation ID from openai.conversations.create() */
  readonly serverConversationId: string;
  readonly id: string;
  readonly metadata: Record<string, unknown> | undefined;
  readonly createdAt: string;
  updatedAt: string;
  /** Accumulated messages (for local getConversation reads) */
  readonly messages: Message[];
}

// ---------------------------------------------------------------------------
// FoundryClient
// ---------------------------------------------------------------------------

export interface FoundryClientOptions {
  readonly config: Config;
  /** Logger instance (Pino-compatible). If omitted, logging is disabled. */
  readonly logger?: Logger | undefined;
}

export class FoundryClient {
  private openai: OpenAI | undefined;
  private projectClient: AIProjectClient | undefined;
  private readonly config: Config;
  private readonly log: Logger;
  private initialised = false;

  /** Conversation records (maps local IDs to server-side conversation IDs). */
  private readonly conversations = new Map<string, ConversationRecord>();

  /** Registered agents returned by the server (maps agent name → SDK Agent). */
  private readonly registeredAgents = new Map<string, Agent>();

  constructor(options: FoundryClientOptions) {
    this.config = options.config;
    this.log = options.logger ?? noopLogger;
  }

  // ---- Initialisation ----

  /**
   * Initialise the SDK client and register agents server-side.
   * Must be called before any other operations.
   */
  async initialise(): Promise<void> {
    await this.setupClient();

    // Register agents server-side (only when AIProjectClient is available)
    if (this.projectClient) {
      await this.registerAgents();
    }

    this.initialised = true;
    this.log.info(
      {
        model: this.config.model,
        agentName: this.config.agentName,
        hasProjectClient: !!this.projectClient,
        registeredAgents: Object.fromEntries(this.registeredAgents)
      },
      'Foundry client initialised'
    );
  }

  private async setupClient(): Promise<void> {
    const isHttpEndpoint = this.config.azureEndpoint.startsWith('http://');

    if (isHttpEndpoint && this.config.skipAuth) {
      // Local development — use base OpenAI client with API key.
      // Same code path as production for conversations and responses.
      this.openai = new OpenAIClient({
        apiKey: 'unused',
        baseURL: this.config.azureEndpoint
      });
      return;
    }

    // Production — use AIProjectClient for agent registration + OpenAI client
    const credential = createAzureCredential();
    const project = new AIProjectClient(this.config.azureEndpoint, credential);
    this.projectClient = project;

    const telemetryConnectionString =
      this.config.applicationInsightsConnectionString ??
      (await project.telemetry.getApplicationInsightsConnectionString());

    // enable Azure Monitor OpenTelemetry with the connection string from the project client
    const options: AzureMonitorOpenTelemetryOptions = {
      azureMonitorExporterOptions: {
        connectionString: telemetryConnectionString
      }
    };
    useAzureMonitor(options);
    setupTelemetry(telemetryConnectionString, 'caira-agent-foundry');

    // getOpenAIClient() returns a standard OpenAI client routed through
    // the Foundry endpoint with proper auth headers.
    this.openai = await project.getOpenAIClient();
  }

  /**
   * Register the specialist agents server-side using a
   * get-or-create pattern:
   *   1. Try to retrieve the agent by name (agents.get)
   *   2. If found, update it (agents.update — creates a new version only
   *      if the definition changed)
   *   3. If not found (404), create it (agents.create)
   *
   * This ensures agents are visible in the Azure AI Foundry portal and
   * that their definitions stay in sync with the container's configuration.
   *
   * Registration failure is FATAL — if any agent cannot be registered the
   * error propagates and the container will not start.
   */
  private async registerAgents(): Promise<void> {
    const project = this.projectClient;
    if (!project) return;

    const agentDefs = [
      {
        name: 'shanty-specialist',
        instructions: this.specialistInstructions('shanty', true),
        tools: this.toolsForMode('shanty')
      },
      {
        name: 'treasure-specialist',
        instructions: this.specialistInstructions('treasure', true),
        tools: this.toolsForMode('treasure')
      },
      {
        name: 'crew-specialist',
        instructions: this.specialistInstructions('crew', true),
        tools: this.toolsForMode('crew')
      }
    ];

    for (const def of agentDefs) {
      const definition = {
        kind: 'prompt' as const,
        model: this.config.model,
        instructions: def.instructions,
        ...('tools' in def ? { tools: def.tools } : {})
      };

      let agent: Agent;

      try {
        // Step 1: Try to retrieve the existing agent
        const existing = await project.agents.get(def.name);
        this.log.info({ agentName: def.name, agentId: existing.id }, 'Agent found — updating definition');

        // Step 2: Update (SDK creates a new version only if definition changed)
        agent = await project.agents.update(def.name, definition);
      } catch (err: unknown) {
        // If the agent doesn't exist, create it. The Azure SDK throws a
        // RestError with statusCode 404 for not-found resources.
        if (isNotFoundError(err)) {
          this.log.info({ agentName: def.name }, 'Agent not found — creating');
          agent = await project.agents.create(def.name, definition);
        } else {
          // Any other error is fatal — re-throw
          throw err;
        }
      }

      this.registeredAgents.set(def.name, agent);

      this.log.info(
        {
          agentName: agent.name,
          agentId: agent.id,
          version: agent.versions.latest.version
        },
        'Agent registered server-side'
      );
    }
  }

  private ensureReady(): OpenAI {
    if (!this.initialised || !this.openai) {
      throw new Error('FoundryClient not initialised — call initialise() first');
    }
    return this.openai;
  }

  // ---- Conversations ----

  async createConversation(metadata?: Record<string, unknown> | undefined): Promise<Conversation> {
    const openai = this.ensureReady();

    const now = new Date().toISOString();

    // Create server-side conversation via OpenAI Conversations API
    const serverConv = await openai.conversations.create();
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const record: ConversationRecord = {
      serverConversationId: serverConv.id,
      id,
      metadata,
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    this.conversations.set(id, record);

    this.log.info({ conversationId: id, serverConversationId: serverConv.id }, 'Conversation created');

    return {
      id,
      createdAt: now,
      updatedAt: now,
      ...(metadata ? { metadata } : {})
    };
  }

  async listConversations(offset = 0, limit = 20): Promise<ConversationList> {
    this.ensureReady();

    const all = Array.from(this.conversations.values());
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    const page = all.slice(offset, offset + limit);
    return {
      items: page.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        ...(r.metadata ? { metadata: r.metadata } : {})
      })),
      offset,
      limit,
      total: all.length
    };
  }

  async getConversation(conversationId: string): Promise<ConversationDetail | undefined> {
    this.ensureReady();

    const record = this.conversations.get(conversationId);
    if (!record) return undefined;

    return {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.metadata ? { metadata: record.metadata } : {}),
      messages: [...record.messages]
    };
  }

  // ---- Messages (non-streaming) ----

  async sendMessage(conversationId: string, content: string): Promise<Message | undefined> {
    const openai = this.ensureReady();
    const record = this.conversations.get(conversationId);
    if (!record) return undefined;

    const mode = this.resolveConversationMode(record.metadata);
    const specialistTool = this.specialistToolName(mode);
    const tracer = trace.getTracer('caira.agent.foundry');
    const emitLifecycleEvents = shouldEmitLifecycleEvents(record.metadata);

    this.log.info(
      {
        conversationId,
        serverConversationId: record.serverConversationId,
        contentLength: content.length,
        mode,
        specialistTool
      },
      'sendMessage started'
    );
    const startTime = Date.now();

    // Record user message locally
    const userMsg: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    record.messages.push(userMsg);

    let fullContent = '';
    let usage: TokenUsage | undefined;
    /** Per-call resolution state — detected from executeToolCall return value, never shared. */
    let localResolution: CapturedResolution | null = null;

    // Tool-call loop with server-side conversation context
    let pendingInput: string | ResponseInputItem.FunctionCallOutput[] = content;
    let loopCount = 0;
    const MAX_LOOPS = 10;

    while (loopCount < MAX_LOOPS) {
      loopCount++;

      const createParams: ResponseCreateParamsNonStreaming = {
        model: this.config.model,
        instructions: this.specialistInstructions(mode, emitLifecycleEvents),
        tools: this.toolsForMode(mode),
        conversation: { id: record.serverConversationId },
        input: pendingInput
      };

      const response = await tracer.startActiveSpan('agent.send_message', async (span) => {
        span.setAttribute('conversation.id', conversationId);
        span.setAttribute('adventure.mode', mode);
        try {
          return await context.with(trace.setSpan(context.active(), span), async () =>
            openai.responses.create(createParams)
          );
        } finally {
          span.end();
        }
      });

      if (response.usage) {
        const ru = response.usage;
        usage = {
          promptTokens: (usage?.promptTokens ?? 0) + (ru.input_tokens ?? 0),
          completionTokens: (usage?.completionTokens ?? 0) + (ru.output_tokens ?? 0)
        };
      }

      // Dump the full raw response for debugging
      this.log.info(
        {
          conversationId,
          loopIteration: loopCount,
          responseId: response.id,
          outputCount: response.output.length,
          outputTypes: response.output.map((o) => o.type),
          rawOutput: response.output.map((o) => JSON.stringify(o).substring(0, 2000))
        },
        'responses.create completed'
      );

      const toolOutputItems: ResponseInputItem.FunctionCallOutput[] = [];

      for (const item of response.output) {
        if (item.type === 'message') {
          const msg = item as ResponseOutputMessage;
          for (const part of msg.content) {
            // Guard: only overwrite if the message text is non-empty.
            // After a resolution tool call the model often makes a
            // follow-up request whose response is an empty string;
            // blindly assigning would erase real text from earlier loops.
            if (part.type === 'output_text' && part.text.length > 0) {
              fullContent = part.text;
            }
          }
        } else if (item.type === 'function_call') {
          const fc = item as ResponseFunctionToolCall;

          this.log.info(
            { conversationId, toolName: fc.name, callId: fc.call_id, args: fc.arguments },
            'Function tool called'
          );

          const toolResult = await this.executeToolCall(fc.name, fc.arguments);

          if (toolResult.resolution) {
            localResolution = toolResult.resolution;
          }

          toolOutputItems.push({
            type: 'function_call_output',
            call_id: fc.call_id,
            output: toolResult.output
          });
        }
      }

      if (toolOutputItems.length === 0) break;
      pendingInput = toolOutputItems;
    }

    const durationMs = Date.now() - startTime;
    record.updatedAt = new Date().toISOString();

    const resolution: ActivityResolution | undefined = localResolution
      ? { tool: localResolution.tool, result: localResolution.result }
      : undefined;

    if (resolution) {
      this.log.info(
        { conversationId, tool: resolution.tool, outcome: resolution.result, durationMs },
        'Resolution tool called'
      );
    }

    this.log.info(
      {
        conversationId,
        durationMs,
        responseLength: fullContent.length,
        hasResolution: !!resolution
      },
      'sendMessage completed'
    );

    const assistantMsg: Message = {
      id: `msg_${Date.now()}_asst`,
      role: 'assistant',
      content: fullContent,
      createdAt: new Date().toISOString(),
      ...(usage ? { usage } : {}),
      ...(resolution ? { resolution } : {})
    };
    record.messages.push(assistantMsg);
    return assistantMsg;
  }

  // ---- Messages (streaming) ----

  /**
   * Send a message and emit SSE-formatted strings via the `onChunk` callback.
   * The caller (routes.ts) writes each chunk directly to the HTTP response.
   *
   * Uses server-side conversation state via the OpenAI Conversations API.
   * When a resolution tool is called during the run, an `activity.resolved`
   * SSE event is emitted with the tool name and structured result.
   */
  async sendMessageStream(conversationId: string, content: string, onChunk: (chunk: string) => void): Promise<void> {
    const openai = this.ensureReady();
    const record = this.conversations.get(conversationId);
    if (!record) {
      this.log.warn({ conversationId }, 'sendMessageStream: conversation not found');
      onChunk(formatSSE('error', { code: 'not_found', message: 'Conversation not found' }));
      return;
    }

    const mode = this.resolveConversationMode(record.metadata);
    const specialistTool = this.specialistToolName(mode);
    const tracer = trace.getTracer('caira.agent.foundry');
    const emitLifecycleEvents = shouldEmitLifecycleEvents(record.metadata);

    this.log.info(
      {
        conversationId,
        serverConversationId: record.serverConversationId,
        contentLength: content.length,
        mode,
        specialistTool
      },
      'sendMessageStream started'
    );
    const startTime = Date.now();

    // Record user message locally
    const userMsg: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content,
      createdAt: new Date().toISOString()
    };
    record.messages.push(userMsg);

    let fullContent = '';
    let usage: TokenUsage | undefined;
    let resolvedEmitted = false;
    /** Per-call resolution state — detected from executeToolCall return value, never shared. */
    let localResolution: CapturedResolution | null = null;

    try {
      if (emitLifecycleEvents) {
        onChunk(formatSSE('tool.called', { toolName: specialistTool } satisfies SSEToolCalledEvent));
      }
      let loopCount = 0;
      const MAX_LOOPS = 10;
      let pendingInput: string | ResponseInputItem.FunctionCallOutput[] = content;

      while (loopCount < MAX_LOOPS) {
        loopCount++;

        const createParams: ResponseCreateAndStreamParams = {
          model: this.config.model,
          instructions: this.specialistInstructions(mode, emitLifecycleEvents),
          tools: this.toolsForMode(mode),
          conversation: { id: record.serverConversationId },
          input: pendingInput
        };

        const stream = await tracer.startActiveSpan('agent.send_message_stream', async (span) => {
          span.setAttribute('conversation.id', conversationId);
          span.setAttribute('adventure.mode', mode);
          try {
            return await context.with(trace.setSpan(context.active(), span), async () =>
              openai.responses.stream(createParams)
            );
          } finally {
            span.end();
          }
        });

        interface PendingFunctionCall {
          name: string;
          callId: string;
          arguments: string;
        }
        const pendingFunctionCalls: PendingFunctionCall[] = [];

        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            const delta = event.delta;
            if (delta) {
              fullContent += delta;
              const sseEvent: SSEDeltaEvent = { content: delta };
              onChunk(formatSSE('message.delta', sseEvent));
              this.log.info(
                {
                  conversationId,
                  elapsedMs: Date.now() - startTime,
                  deltaLength: delta.length,
                  accumulatedLength: fullContent.length
                },
                'stream delta: output_text_delta'
              );
            }
          } else if (event.type === 'response.output_item.added') {
            const item = event.item;
            if (item.type === 'function_call' && KNOWLEDGE_TOOLS.has(item.name) && emitLifecycleEvents) {
              const toolCalledEvent: SSEToolCalledEvent = { toolName: item.name };
              onChunk(formatSSE('tool.called', toolCalledEvent));
              this.log.info(
                { conversationId, toolName: item.name, elapsedMs: Date.now() - startTime },
                'Specialist tool called (stream)'
              );
            }
          } else if (event.type === 'response.output_item.done') {
            const item = event.item;
            if (item.type === 'function_call') {
              pendingFunctionCalls.push({
                name: item.name,
                callId: item.call_id,
                arguments: item.arguments ?? '{}'
              });
            } else if (item.type === 'message') {
              // When using the Conversations API, the model may produce
              // text inside message output items WITHOUT emitting
              // response.output_text.delta events (e.g. when the response
              // also contains function calls).  Extract the text from the
              // completed message item so it isn't lost.
              const msg = item as ResponseOutputMessage;
              for (const part of msg.content) {
                if (part.type === 'output_text' && part.text.length > 0) {
                  fullContent += part.text;
                  const sseEvent: SSEDeltaEvent = { content: part.text };
                  onChunk(formatSSE('message.delta', sseEvent));
                  this.log.info(
                    {
                      conversationId,
                      elapsedMs: Date.now() - startTime,
                      deltaLength: part.text.length,
                      accumulatedLength: fullContent.length,
                      source: 'output_item.done'
                    },
                    'stream delta: message item text'
                  );
                }
              }
            }
          } else if (event.type === 'response.completed') {
            const completedResponse = event.response;
            if (completedResponse.usage) {
              usage = {
                promptTokens: (usage?.promptTokens ?? 0) + (completedResponse.usage.input_tokens ?? 0),
                completionTokens: (usage?.completionTokens ?? 0) + (completedResponse.usage.output_tokens ?? 0)
              };
            }
            this.log.info(
              {
                conversationId,
                responseId: completedResponse.id,
                elapsedMs: Date.now() - startTime,
                usage: completedResponse.usage
              },
              'stream event: response.completed'
            );
          }
        }

        if (pendingFunctionCalls.length === 0) break;

        const toolOutputItems: ResponseInputItem.FunctionCallOutput[] = [];

        for (const fc of pendingFunctionCalls) {
          this.log.info(
            { conversationId, toolName: fc.name, callId: fc.callId, args: fc.arguments },
            'Executing tool call (stream)'
          );

          if (KNOWLEDGE_TOOLS.has(fc.name) && emitLifecycleEvents) {
            const toolDoneEvent: SSEToolDoneEvent = { toolName: fc.name };
            onChunk(formatSSE('tool.done', toolDoneEvent));
            this.log.info(
              { conversationId, toolName: fc.name, elapsedMs: Date.now() - startTime },
              'Specialist tool done (stream)'
            );
          }

          const toolResult = await this.executeToolCall(fc.name, fc.arguments);

          toolOutputItems.push({
            type: 'function_call_output',
            call_id: fc.callId,
            output: toolResult.output
          });

          if (toolResult.resolution && !resolvedEmitted) {
            localResolution = toolResult.resolution;
            const resolvedEvent: SSEResolvedEvent = {
              tool: toolResult.resolution.tool,
              result: toolResult.resolution.result
            };
            onChunk(formatSSE('activity.resolved', resolvedEvent));
            resolvedEmitted = true;
            this.log.info(
              {
                conversationId,
                tool: toolResult.resolution.tool,
                outcome: toolResult.resolution.result
              },
              'Resolution tool called (stream)'
            );
          }
        }

        pendingInput = toolOutputItems;
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown streaming error';
      this.log.error({ conversationId, err }, 'sendMessageStream error');
      onChunk(formatSSE('error', { code: 'agent_error', message }));
      return;
    }

    const durationMs = Date.now() - startTime;
    record.updatedAt = new Date().toISOString();

    const resolution: ActivityResolution | undefined = localResolution
      ? { tool: localResolution.tool, result: localResolution.result }
      : undefined;

    if (localResolution && !resolvedEmitted) {
      const resolvedEvent: SSEResolvedEvent = {
        tool: localResolution.tool,
        result: localResolution.result
      };
      onChunk(formatSSE('activity.resolved', resolvedEvent));
      this.log.info(
        { conversationId, tool: localResolution.tool, outcome: localResolution.result },
        'Resolution tool called (stream, post-completion)'
      );
    }

    const completeEvent: SSECompleteEvent = {
      messageId: `msg_${Date.now()}_asst`,
      content: fullContent,
      ...(usage ? { usage } : {})
    };
    if (emitLifecycleEvents) {
      onChunk(formatSSE('tool.done', { toolName: specialistTool } satisfies SSEToolDoneEvent));
    }
    onChunk(formatSSE('message.complete', completeEvent));

    this.log.info(
      {
        conversationId,
        durationMs,
        responseLength: fullContent.length,
        hasResolution: !!resolution
      },
      'sendMessageStream completed'
    );

    const assistantMsg: Message = {
      id: completeEvent.messageId,
      role: 'assistant',
      content: fullContent,
      createdAt: new Date().toISOString(),
      ...(usage ? { usage } : {}),
      ...(resolution ? { resolution } : {})
    };
    record.messages.push(assistantMsg);
  }

  // ---- Health ----

  async checkHealth(): Promise<HealthResponse> {
    try {
      this.ensureReady();

      const start = Date.now();
      const latencyMs = Date.now() - start;

      return {
        status: 'healthy',
        checks: [
          {
            name: 'azure-ai-foundry',
            status: 'healthy',
            latencyMs
          }
        ]
      };
    } catch {
      return {
        status: 'degraded',
        checks: [{ name: 'azure-ai-foundry', status: 'unhealthy' }]
      };
    }
  }

  // ---- Tool execution ----

  /**
   * Execute a function tool call. For specialist tools, call the Responses API
   * with the specialist's instructions. For resolution tools, parse the
   * structured result and return it alongside the output string.
   *
   * Returns `{ output, resolution? }` so callers can detect resolution from
   * the return value — no shared mutable state needed.
   */
  private async executeToolCall(
    toolName: string,
    toolArgs: string
  ): Promise<{ output: string; resolution?: CapturedResolution }> {
    let args: Record<string, unknown>;
    try {
      args = JSON.parse(toolArgs) as Record<string, unknown>;
    } catch {
      this.log.warn({ toolName, toolArgs }, 'Failed to parse tool arguments');
      return { output: 'Error: invalid tool arguments' };
    }

    if (toolName === 'lookup_shanty_knowledge') {
      const query = (args['query'] as string) ?? (args['request'] as string) ?? '';
      return { output: JSON.stringify({ items: lookupShantyKnowledge(query) }) };
    }

    if (toolName === 'lookup_treasure_knowledge') {
      const query = (args['query'] as string) ?? (args['request'] as string) ?? '';
      return { output: JSON.stringify({ items: lookupTreasureKnowledge(query) }) };
    }

    if (toolName === 'lookup_crew_knowledge') {
      const query = (args['query'] as string) ?? (args['request'] as string) ?? '';
      return { output: JSON.stringify({ items: lookupCrewKnowledge(query) }) };
    }

    // Resolution tools — return the structured result alongside the output string
    if (RESOLUTION_TOOLS.has(toolName)) {
      const resolution: CapturedResolution = { tool: toolName, result: args };
      let output: string;

      switch (toolName) {
        case 'resolve_shanty':
          output = `Shanty battle resolved: ${args['winner']} wins after ${args['rounds']} rounds.`;
          break;
        case 'resolve_treasure':
          output = `Treasure hunt resolved: ${args['found'] ? 'Found' : 'Lost'} "${args['treasure_name']}" at ${args['location']}.`;
          break;
        case 'resolve_crew':
          output = `Crew interview resolved: ${args['rank']} ${args['role']} aboard the ${args['ship_name']}.`;
          break;
        default:
          output = `Activity resolved via ${toolName}.`;
          break;
      }

      return { output, resolution };
    }

    this.log.warn({ toolName }, 'Unknown tool called');
    return { output: `Error: unknown tool "${toolName}"` };
  }

  private resolveConversationMode(metadata: Record<string, unknown> | undefined): 'shanty' | 'treasure' | 'crew' {
    const mode = metadata?.['mode'];
    if (mode === 'treasure' || mode === 'crew' || mode === 'shanty') {
      return mode;
    }
    return 'shanty';
  }

  private specialistToolName(mode: 'shanty' | 'treasure' | 'crew'): string {
    switch (mode) {
      case 'treasure':
        return 'treasure_specialist';
      case 'crew':
        return 'crew_specialist';
      case 'shanty':
      default:
        return 'shanty_specialist';
    }
  }

  private specialistInstructions(mode: 'shanty' | 'treasure' | 'crew', includeShared = true): string {
    const shared = this.config.captainInstructions.trim();
    const specific =
      mode === 'treasure'
        ? this.config.treasureInstructions
        : mode === 'crew'
          ? this.config.crewInstructions
          : this.config.shantyInstructions;
    return includeShared ? `${shared}\n\n${specific}`.trim() : specific;
  }

  private toolsForMode(mode: 'shanty' | 'treasure' | 'crew'): FunctionTool[] {
    const knowledgeTool =
      mode === 'treasure'
        ? TOOL_DEFINITIONS.find((tool) => tool.name === 'lookup_treasure_knowledge')
        : mode === 'crew'
          ? TOOL_DEFINITIONS.find((tool) => tool.name === 'lookup_crew_knowledge')
          : TOOL_DEFINITIONS.find((tool) => tool.name === 'lookup_shanty_knowledge');
    const resolutionTool =
      mode === 'treasure'
        ? TOOL_DEFINITIONS.find((tool) => tool.name === 'resolve_treasure')
        : mode === 'crew'
          ? TOOL_DEFINITIONS.find((tool) => tool.name === 'resolve_crew')
          : TOOL_DEFINITIONS.find((tool) => tool.name === 'resolve_shanty');

    return [knowledgeTool, resolutionTool].filter((tool): tool is FunctionTool => tool !== undefined);
  }
}

// ---- SSE formatting ----

function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
