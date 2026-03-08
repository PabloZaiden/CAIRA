/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Unit tests for src/run-helpers.ts — result extraction, SSE formatting,
 * and resolution detection.
 *
 * Tests these functions in isolation using minimal mock data that matches
 * the SDK type shapes.
 */

import { describe, it, expect } from 'vitest';
import { formatSSE, extractTextFromResult, extractUsage, extractResolutionFromItems } from '../src/run-helpers.ts';
import type { RunItem } from '@openai/agents';
import type { Logger } from '../src/openai-client.ts';

// ---------- Helpers ----------

/** No-op logger for tests that don't care about log output. */
const noopLog: Logger = {
  trace() {},
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return noopLog;
  }
};

/** Cast an array of partial item shapes to RunItem[] for testing. */
function asRunItems(items: Array<Record<string, unknown>>): readonly RunItem[] {
  return items as unknown as readonly RunItem[];
}

/**
 * Create a minimal RunResult-shaped object for testing extractTextFromResult
 * and extractUsage.
 */
function makeResult(
  finalOutput: string | undefined,
  newItems: Array<{ type: string; content?: string }>,
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
) {
  return {
    finalOutput,
    newItems,
    lastResponseId: 'resp_test',
    state: {
      usage: usage ?? { requests: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }
    }
  } as Parameters<typeof extractTextFromResult>[0];
}

// ---------- Tests ----------

describe('formatSSE', () => {
  it('formats a simple event with data', () => {
    const result = formatSSE('message.delta', { content: 'hello' });
    expect(result).toBe('event: message.delta\ndata: {"content":"hello"}\n\n');
  });

  it('handles string data', () => {
    const result = formatSSE('ping', 'alive');
    expect(result).toBe('event: ping\ndata: "alive"\n\n');
  });

  it('handles complex objects', () => {
    const result = formatSSE('activity.resolved', {
      tool: 'resolve_shanty',
      result: { winner: 'user', rounds: 3 }
    });
    expect(result).toContain('event: activity.resolved');
    expect(result).toContain('"tool":"resolve_shanty"');
    expect(result).toContain('"winner":"user"');
  });
});

describe('extractTextFromResult', () => {
  it('uses finalOutput when it is a non-empty string', () => {
    const result = makeResult('Hello there', []);
    expect(extractTextFromResult(result, noopLog)).toBe('Hello there');
  });

  it('falls back to newItems when finalOutput is undefined', () => {
    const result = makeResult(undefined, [{ type: 'message_output_item', content: 'From items' }]);
    expect(extractTextFromResult(result, noopLog)).toBe('From items');
  });

  it('falls back to newItems when finalOutput is empty string', () => {
    const result = makeResult('', [{ type: 'message_output_item', content: 'Fallback text' }]);
    expect(extractTextFromResult(result, noopLog)).toBe('Fallback text');
  });

  it('returns the last non-empty message_output_item', () => {
    const result = makeResult(undefined, [
      { type: 'message_output_item', content: 'First' },
      { type: 'tool_call_item' },
      { type: 'message_output_item', content: 'Last' }
    ]);
    expect(extractTextFromResult(result, noopLog)).toBe('Last');
  });

  it('skips message_output_items with empty content', () => {
    const result = makeResult(undefined, [
      { type: 'message_output_item', content: 'Real content' },
      { type: 'message_output_item', content: '' }
    ]);
    expect(extractTextFromResult(result, noopLog)).toBe('Real content');
  });

  it('returns empty string when no text is found', () => {
    const result = makeResult(undefined, [{ type: 'tool_call_item' }]);
    expect(extractTextFromResult(result, noopLog)).toBe('');
  });
});

describe('extractUsage', () => {
  it('returns usage when tokens are consumed', () => {
    const result = makeResult('text', [], {
      inputTokens: 50,
      outputTokens: 30,
      totalTokens: 80
    });
    expect(extractUsage(result)).toEqual({
      promptTokens: 50,
      completionTokens: 30
    });
  });

  it('returns undefined when no tokens consumed', () => {
    const result = makeResult('text', [], {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0
    });
    expect(extractUsage(result)).toBeUndefined();
  });
});

describe('extractResolutionFromItems', () => {
  it('detects a resolution tool call', () => {
    const items = asRunItems([
      {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: 'resolve_shanty',
          arguments: JSON.stringify({ winner: 'user', rounds: 3, best_verse: 'A verse' }),
          callId: 'call_1'
        }
      }
    ]);
    const result = extractResolutionFromItems(items, noopLog);
    expect(result).toEqual({
      tool: 'resolve_shanty',
      result: { winner: 'user', rounds: 3, best_verse: 'A verse' }
    });
  });

  it('returns null when no resolution tool is present', () => {
    const items = asRunItems([
      {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: 'some_other_tool',
          arguments: '{}',
          callId: 'call_1'
        }
      }
    ]);
    const result = extractResolutionFromItems(items, noopLog);
    expect(result).toBeNull();
  });

  it('returns null for empty items', () => {
    const result = extractResolutionFromItems([], noopLog);
    expect(result).toBeNull();
  });

  it('handles invalid JSON in arguments gracefully', () => {
    const items = asRunItems([
      {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: 'resolve_treasure',
          arguments: 'not valid json{{{',
          callId: 'call_1'
        }
      }
    ]);
    const result = extractResolutionFromItems(items, noopLog);
    expect(result).toBeNull();
  });

  it('returns the first resolution when multiple are present', () => {
    const items = asRunItems([
      {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: 'resolve_shanty',
          arguments: JSON.stringify({ winner: 'user', rounds: 1, best_verse: 'v1' }),
          callId: 'call_1'
        }
      },
      {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: 'resolve_treasure',
          arguments: JSON.stringify({ found: true, treasure_name: 'Gold', location: 'Cave' }),
          callId: 'call_2'
        }
      }
    ]);
    const result = extractResolutionFromItems(items, noopLog);
    expect(result!.tool).toBe('resolve_shanty');
  });

  it('skips non-tool_call_item types', () => {
    const items = asRunItems([
      { type: 'message_output_item', content: 'Hello', rawItem: {} },
      {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: 'resolve_crew',
          arguments: JSON.stringify({ rank: 'Captain', role: 'Navigator', ship_name: 'Dawn' }),
          callId: 'call_1'
        }
      }
    ]);
    const result = extractResolutionFromItems(items, noopLog);
    expect(result).toEqual({
      tool: 'resolve_crew',
      result: { rank: 'Captain', role: 'Navigator', ship_name: 'Dawn' }
    });
  });
});
