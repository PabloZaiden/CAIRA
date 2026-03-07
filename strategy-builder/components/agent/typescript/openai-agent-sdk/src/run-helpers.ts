/**
 * Run processing helpers — result extraction, SSE formatting, logging.
 *
 * These functions process the output of SDK `run()` calls:
 *   - Extract response text from RunResult (finalOutput or newItems fallback)
 *   - Extract token usage from RunResult state
 *   - Detect resolution tool calls from SDK output items
 *   - Format Server-Sent Events (SSE) for the streaming endpoint
 *   - Log RunResult details at appropriate levels (debug/trace)
 *
 * All functions are stateless — they take their inputs as parameters and
 * return results without side-effects (logging is the only side-effect,
 * passed via the Logger parameter).
 */

import type { RunResult, Agent, ModelResponse } from '@openai/agents';
import type {
  RunItem,
  RunToolCallItem,
  RunToolCallOutputItem,
  RunReasoningItem,
  RunMessageOutputItem
} from '@openai/agents';
import type { Logger } from './openai-client.ts';
import type { TokenUsage } from './types.ts';
import { RESOLUTION_TOOLS } from './agent-setup.ts';

// ---------------------------------------------------------------------------
// SDK type aliases — eliminate `any` in generic positions
// ---------------------------------------------------------------------------

/**
 * Concrete RunResult type for our agent runs.
 *
 * The SDK's `run()` returns `RunResult<TContext, TAgent>`. Our agent uses
 * no custom context (undefined) and the default Agent type. We use
 * `Agent<any, any>` here because the SDK's own type constraints require it
 * (Agent is covariant in its type params and the run function constrains
 * TAgent extends Agent<any, any>).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentRunResult = RunResult<any, Agent<any, any>>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Captured resolution data extracted from SDK output items or stream events.
 * Used as a local variable in each sendMessage/sendMessageStream call —
 * never stored at the instance level, so concurrent conversations cannot
 * interfere with each other.
 */
export interface CapturedResolution {
  tool: string;
  result: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// SSE formatting
// ---------------------------------------------------------------------------

/** Format a Server-Sent Event (SSE) string for the streaming endpoint. */
export function formatSSE(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ---------------------------------------------------------------------------
// Result extraction
// ---------------------------------------------------------------------------

/**
 * Extract response text from a RunResult.
 *
 * Strategy:
 *   1. Use `finalOutput` if it's a non-empty string (available when outputType is 'text')
 *   2. Fall back to the last non-empty `message_output_item` in newItems
 *      (handles cases where the captain invokes tools and the final response
 *      appears as a later item)
 */
export function extractTextFromResult(result: AgentRunResult, log: Logger): string {
  // Try finalOutput first (available when outputType is 'text')
  if (typeof result.finalOutput === 'string' && result.finalOutput.length > 0) {
    log.debug(
      { source: 'finalOutput', contentLength: result.finalOutput.length },
      'extractTextFromResult: using finalOutput'
    );
    log.trace(
      {
        content: result.finalOutput.length > 500 ? result.finalOutput.substring(0, 500) + '...' : result.finalOutput
      },
      'extractTextFromResult: finalOutput content'
    );
    return result.finalOutput;
  }

  // Fall back to extracting text from new items.
  // Collect ALL message_output_item content — when the captain invokes
  // tools, the final response may appear as a later item in newItems.
  // We take the last non-empty message to get the captain's response.
  let lastContent = '';
  for (const item of result.newItems) {
    if (item.type === 'message_output_item') {
      const content = (item as RunMessageOutputItem).content;
      if (content) {
        lastContent = content;
      }
    }
  }

  if (lastContent.length > 0) {
    log.debug(
      {
        source: 'newItems',
        contentLength: lastContent.length,
        newItemCount: result.newItems.length
      },
      'extractTextFromResult: using newItems fallback'
    );
    log.trace(
      { content: lastContent.length > 500 ? lastContent.substring(0, 500) + '...' : lastContent },
      'extractTextFromResult: newItems content'
    );
  } else {
    log.warn(
      {
        finalOutputType: typeof result.finalOutput,
        finalOutputLength: typeof result.finalOutput === 'string' ? result.finalOutput.length : 0,
        newItemCount: result.newItems.length,
        newItemTypes: result.newItems.map((i: { type: string }) => i.type)
      },
      'extractTextFromResult: empty result — no text found in finalOutput or newItems'
    );
  }

  return lastContent;
}

/**
 * Extract token usage from a RunResult.
 * Returns undefined if no tokens were consumed.
 */
export function extractUsage(result: AgentRunResult): TokenUsage | undefined {
  const usage = result.state.usage;
  if (usage && usage.totalTokens > 0) {
    return {
      promptTokens: usage.inputTokens,
      completionTokens: usage.outputTokens
    };
  }
  return undefined;
}

/**
 * Scan a list of SDK run items for a resolution tool call.
 * Returns the first resolution found, or null if none.
 *
 * This is used for non-streaming runs where `result.newItems` is available
 * after the run completes.  Each item of type `tool_call_item` has a
 * `rawItem` with `name` (tool name) and `arguments` (JSON string).
 */
export function extractResolutionFromItems(items: readonly RunItem[], log: Logger): CapturedResolution | null {
  for (const item of items) {
    if (item.type !== 'tool_call_item') continue;
    const toolCallItem = item as RunToolCallItem;
    const rawItem = toolCallItem.rawItem;
    const name = 'name' in rawItem ? rawItem.name : undefined;
    if (!name || !RESOLUTION_TOOLS.has(name)) continue;

    const argsStr = 'arguments' in rawItem ? rawItem.arguments : undefined;
    if (!argsStr) continue;

    try {
      const parsedArgs = JSON.parse(argsStr) as Record<string, unknown>;
      return { tool: name, result: parsedArgs };
    } catch {
      log.warn(
        { toolName: name, arguments: argsStr },
        'Failed to parse resolution tool arguments from run result item'
      );
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Run result logging
// ---------------------------------------------------------------------------

/**
 * Log every item from a RunResult for full visibility into what the SDK
 * produced.  The overall result summary is logged at debug level; individual
 * items and raw responses at trace level.
 */
export function logRunResult(result: AgentRunResult, conversationId: string, elapsedMs: number, log: Logger): void {
  // Log which agent ended up handling the request
  const lastAgent = result.lastAgent;
  log.debug(
    {
      conversationId,
      elapsedMs,
      lastAgent: lastAgent?.name ?? 'unknown',
      newItemCount: result.newItems.length,
      newItemTypes: result.newItems.map((i: { type: string }) => i.type),
      finalOutputType: typeof result.finalOutput,
      finalOutputLength: typeof result.finalOutput === 'string' ? result.finalOutput.length : 0
    },
    'run result summary'
  );

  log.trace(
    {
      conversationId,
      finalOutput:
        typeof result.finalOutput === 'string'
          ? result.finalOutput.length > 500
            ? result.finalOutput.substring(0, 500) + '...'
            : result.finalOutput
          : undefined
    },
    'run result finalOutput'
  );

  // Log each item individually
  for (let idx = 0; idx < result.newItems.length; idx++) {
    const item = result.newItems[idx];
    if (!item) continue;
    logRunItem(item, conversationId, idx, log);
  }

  // Log raw responses summary (one per model turn) with actual output items
  // rawResponses is typed as ModelResponse[] on RunResultBase, but test mocks
  // may not provide it (the getter reads from internal state which may be empty).
  const rawResponses: ModelResponse[] | undefined = result.rawResponses;
  if (rawResponses && rawResponses.length > 0) {
    for (let i = 0; i < rawResponses.length; i++) {
      const resp = rawResponses[i];
      if (!resp) continue;
      const outputItems = Array.isArray(resp.output)
        ? resp.output.map((outputItem, idx: number) => {
            const item = outputItem as Record<string, unknown>;
            const itemSummary: Record<string, unknown> = {
              index: idx,
              type: item['type']
            };
            // For message items, include content parts
            if (item['type'] === 'message' && Array.isArray(item['content'])) {
              itemSummary['content'] = (item['content'] as Array<Record<string, unknown>>).map((part) => ({
                type: part['type'],
                text:
                  typeof part['text'] === 'string'
                    ? (part['text'] as string).length > 200
                      ? (part['text'] as string).substring(0, 200) + '...'
                      : part['text']
                    : undefined,
                textLength: typeof part['text'] === 'string' ? (part['text'] as string).length : undefined
              }));
            }
            // For function_call items, include name and arguments
            if (item['type'] === 'function_call') {
              itemSummary['name'] = item['name'];
              itemSummary['arguments'] =
                typeof item['arguments'] === 'string'
                  ? (item['arguments'] as string).substring(0, 500)
                  : item['arguments'];
            }
            // For reasoning items, just note presence
            if (item['type'] === 'reasoning') {
              itemSummary['hasContent'] = !!item['content'];
            }
            return itemSummary;
          })
        : undefined;

      log.trace(
        {
          conversationId,
          responseIndex: i,
          responseId: resp.responseId,
          outputCount: outputItems?.length,
          outputItems,
          usage: resp.usage
        },
        'run rawResponse'
      );
    }
  }
}

/**
 * Log a single RunItem with all available details (at debug/trace level).
 */
export function logRunItem(item: RunItem, conversationId: string, index: number, log: Logger): void {
  const base = { conversationId, itemIndex: index, itemType: item.type };

  switch (item.type) {
    case 'message_output_item': {
      const msgItem = item as RunMessageOutputItem;
      // Log both the .content getter result AND the raw content parts array
      // so we can see exactly what the model produced
      const rawContent = msgItem.rawItem.content;
      log.debug(
        {
          ...base,
          agent: msgItem.agent?.name ?? 'unknown',
          contentGetterLength: msgItem.content.length
        },
        'run item: message_output_item'
      );
      log.trace(
        {
          ...base,
          contentGetter: msgItem.content.substring(0, 500),
          rawContentParts: Array.isArray(rawContent)
            ? rawContent.map((part) => ({
                type: part.type,
                textLength: 'text' in part && typeof part.text === 'string' ? part.text.length : undefined,
                text: 'text' in part && typeof part.text === 'string' ? part.text.substring(0, 200) : undefined
              }))
            : rawContent,
          rawContentLength: Array.isArray(rawContent) ? rawContent.length : 0
        },
        'run item detail: message_output_item'
      );
      break;
    }
    case 'tool_call_item': {
      const tcItem = item as RunToolCallItem;
      const tcRawItem = tcItem.rawItem;
      log.debug(
        {
          ...base,
          agent: tcItem.agent?.name ?? 'unknown',
          toolName: 'name' in tcRawItem ? tcRawItem.name : tcRawItem.type,
          arguments: 'arguments' in tcRawItem ? tcRawItem.arguments : undefined
        },
        'run item: tool_call_item'
      );
      break;
    }
    case 'tool_call_output_item': {
      const tcoItem = item as RunToolCallOutputItem;
      log.debug(
        {
          ...base,
          agent: tcoItem.agent?.name ?? 'unknown',
          output: typeof tcoItem.output === 'string' ? tcoItem.output.substring(0, 500) : tcoItem.output
        },
        'run item: tool_call_output_item'
      );
      break;
    }
    case 'reasoning_item': {
      const rItem = item as RunReasoningItem;
      log.debug(
        {
          ...base,
          agent: rItem.agent?.name ?? 'unknown'
        },
        'run item: reasoning_item'
      );
      break;
    }
    default: {
      // Catch-all for any future item types (handoff_call_item, handoff_output_item, tool_approval_item)
      const agentName =
        'agent' in item && item.agent && typeof item.agent === 'object' && 'name' in item.agent
          ? (item.agent.name as string)
          : 'unknown';
      log.debug(
        {
          ...base,
          agent: agentName
        },
        `run item: ${item.type}`
      );
      break;
    }
  }
}
