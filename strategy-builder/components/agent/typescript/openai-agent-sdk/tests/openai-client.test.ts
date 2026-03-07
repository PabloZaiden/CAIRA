/* eslint-disable @typescript-eslint/no-non-null-assertion */
/**
 * Tests for src/openai-client.ts — OpenAI Agent SDK wrapper (agent-as-tool).
 *
 * Mocks the `run` function to test conversation lifecycle,
 * message handling, streaming, resolution tools, and health checks
 * without real Azure calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIClient } from '../src/openai-client.ts';
import type { Config } from '../src/config.ts';

// ---------- Test config ----------

const TEST_CONFIG: Config = {
  port: 3000,
  host: '0.0.0.0',
  azureEndpoint: 'https://test.openai.azure.com',
  apiVersion: '2025-03-01-preview',
  model: 'gpt-5.2-chat',
  agentName: 'Test Agent',
  captainInstructions: 'You are the captain agent. Route to specialists.',
  shantyInstructions: 'You are a shanty specialist.',
  treasureInstructions: 'You are a treasure specialist.',
  crewInstructions: 'You are a crew specialist.',
  logLevel: 'silent',
  skipAuth: true
};

// ---------- Mock helpers ----------

/**
 * Creates a mock RunResult matching the shape returned by `run()`.
 */
function makeRunResult(
  text: string,
  responseId = 'resp_001',
  options?: {
    /** Add a resolution tool call item to newItems (detected by extractResolutionFromItems) */
    resolution?: { tool: string; result: Record<string, unknown> };
  }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const newItems: any[] = [];

  // If resolution is specified, add a tool_call_item with the resolution tool's rawItem
  if (options?.resolution) {
    newItems.push({
      type: 'tool_call_item' as const,
      rawItem: {
        type: 'function_call',
        name: options.resolution.tool,
        arguments: JSON.stringify(options.resolution.result),
        callId: 'call_res_mock'
      }
    });
  }

  // Always add the message output item
  newItems.push({
    type: 'message_output_item' as const,
    content: text,
    rawItem: { role: 'assistant', content: text }
  });

  return {
    finalOutput: text,
    newItems,
    lastResponseId: responseId,
    history: [],
    state: {
      usage: {
        requests: 1,
        inputTokens: 50,
        outputTokens: 30,
        totalTokens: 80
      }
    }
  };
}

/**
 * Creates a mock StreamedRunResult that emits raw_model_stream_event deltas.
 */
function makeStreamedRunResult(
  chunks: string[],
  finalText: string,
  responseId = 'resp_stream_001',
  options?: {
    /** If true, emit a tool_output event to trigger resolution detection */
    emitToolOutput?: boolean;
    /** Emit tool_called + tool_output events for a specialist tool (by name) */
    specialistToolCall?: string;
    /** Emit tool_called + tool_output events for a resolution tool (with args) */
    resolutionToolCall?: { name: string; arguments: string };
  }
) {
  const events: Array<Record<string, unknown>> = [];

  // Emit output_text_delta events for each chunk
  for (const chunk of chunks) {
    events.push({
      type: 'raw_model_stream_event',
      data: {
        type: 'output_text_delta',
        delta: chunk
      }
    });
  }

  // Optionally emit tool_called + tool_output events for a specialist tool
  if (options?.specialistToolCall) {
    events.push({
      type: 'run_item_stream_event',
      name: 'tool_called',
      item: {
        type: 'tool_call_item',
        rawItem: { name: options.specialistToolCall }
      }
    });
    events.push({
      type: 'run_item_stream_event',
      name: 'tool_output',
      item: {
        type: 'tool_call_output_item',
        rawItem: { name: options.specialistToolCall }
      }
    });
  }

  // Optionally emit tool_called + tool_output for a resolution tool
  if (options?.resolutionToolCall) {
    events.push({
      type: 'run_item_stream_event',
      name: 'tool_called',
      item: {
        type: 'tool_call_item',
        rawItem: {
          type: 'function_call',
          name: options.resolutionToolCall.name,
          arguments: options.resolutionToolCall.arguments,
          callId: 'call_res_stream'
        }
      }
    });
    events.push({
      type: 'run_item_stream_event',
      name: 'tool_output',
      item: {
        type: 'tool_call_output_item',
        rawItem: { name: options.resolutionToolCall.name }
      }
    });
  }

  // Optionally emit a bare tool_output event (legacy, for backward compat tests)
  if (options?.emitToolOutput) {
    events.push({
      type: 'run_item_stream_event',
      name: 'tool_output',
      item: { type: 'tool_call_output_item' }
    });
  }

  // Emit a message_output_created event with the full text
  events.push({
    type: 'run_item_stream_event',
    name: 'message_output_created',
    item: {
      type: 'message_output_item',
      content: finalText,
      rawItem: { role: 'assistant', content: finalText }
    }
  });

  let completedResolve: () => void;
  const completedPromise = new Promise<void>((resolve) => {
    completedResolve = resolve;
  });

  const streamResult = {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event;
      }
      // Resolve completed after all events are yielded
      completedResolve!();
    },
    completed: completedPromise,
    lastResponseId: responseId,
    state: {
      usage: {
        requests: 1,
        inputTokens: 50,
        outputTokens: 30,
        totalTokens: 80
      }
    },
    currentAgent: {},
    cancelled: false,
    toTextStream: () => new ReadableStream(),
    toStream: () => new ReadableStream()
  };

  return streamResult;
}

// ---------- Tests ----------

describe('OpenAIClient', () => {
  let mockRunFn: ReturnType<typeof vi.fn>;
  let client: OpenAIClient;

  beforeEach(async () => {
    mockRunFn = vi.fn();
    client = new OpenAIClient({
      config: TEST_CONFIG,
      runFn: mockRunFn,
      skipClientSetup: true
    });
    await client.initialise();
  });

  describe('initialise', () => {
    it('creates agent hierarchy with captain and specialist tools', async () => {
      // The agent is created during initialise — we verify the client is ready
      // by calling createConversation (which calls ensureReady)
      const conv = await client.createConversation();
      expect(conv.id).toMatch(/^conv_/);
    });

    it('throws if operations called before initialise', async () => {
      const uninitClient = new OpenAIClient({
        config: TEST_CONFIG,
        runFn: mockRunFn,
        skipClientSetup: true
      });
      // Don't call initialise
      await expect(uninitClient.createConversation()).rejects.toThrow('not initialised');
    });
  });

  describe('createConversation', () => {
    it('creates a conversation and returns it', async () => {
      const conv = await client.createConversation();
      expect(conv.id).toMatch(/^conv_/);
      expect(conv.createdAt).toBeDefined();
      expect(conv.updatedAt).toBeDefined();
    });

    it('includes metadata when provided', async () => {
      const meta = { topic: 'testing' };
      const conv = await client.createConversation(meta);
      expect(conv.metadata).toEqual({ topic: 'testing' });
    });

    it('omits metadata key when none provided', async () => {
      const conv = await client.createConversation();
      expect(conv).not.toHaveProperty('metadata');
    });
  });

  describe('listConversations', () => {
    it('returns empty list when no conversations', async () => {
      const list = await client.listConversations();
      expect(list.items).toEqual([]);
      expect(list.total).toBe(0);
      expect(list.offset).toBe(0);
      expect(list.limit).toBe(20);
    });

    it('returns conversations after creation', async () => {
      await client.createConversation();
      await client.createConversation();
      await client.createConversation();

      const list = await client.listConversations();
      expect(list.items).toHaveLength(3);
      expect(list.total).toBe(3);
    });

    it('respects offset and limit', async () => {
      await client.createConversation();
      await client.createConversation();
      await client.createConversation();

      const list = await client.listConversations(1, 1);
      expect(list.items).toHaveLength(1);
      expect(list.offset).toBe(1);
      expect(list.limit).toBe(1);
      expect(list.total).toBe(3);
    });
  });

  describe('getConversation', () => {
    it('returns undefined for unknown conversation', async () => {
      const detail = await client.getConversation('nonexistent');
      expect(detail).toBeUndefined();
    });

    it('returns conversation with empty messages initially', async () => {
      const conv = await client.createConversation();
      const detail = await client.getConversation(conv.id);
      expect(detail).toBeDefined();
      expect(detail!.id).toBe(conv.id);
      expect(detail!.messages).toEqual([]);
    });

    it('returns conversation with messages after sendMessage', async () => {
      const conv = await client.createConversation();
      mockRunFn.mockResolvedValue(makeRunResult('Hello back!'));

      await client.sendMessage(conv.id, 'Hello');

      const detail = await client.getConversation(conv.id);
      expect(detail).toBeDefined();
      expect(detail!.messages).toHaveLength(2); // user + assistant
      expect(detail!.messages[0]!.role).toBe('user');
      expect(detail!.messages[0]!.content).toBe('Hello');
      expect(detail!.messages[1]!.role).toBe('assistant');
      expect(detail!.messages[1]!.content).toBe('Hello back!');
    });
  });

  describe('sendMessage (non-streaming)', () => {
    it('sends user message and returns assistant response', async () => {
      const conv = await client.createConversation();
      mockRunFn.mockResolvedValue(makeRunResult('Ahoy matey!'));

      const result = await client.sendMessage(conv.id, 'Hello pirate!');
      expect(result).toBeDefined();
      expect(result!.role).toBe('assistant');
      expect(result!.content).toBe('Ahoy matey!');
    });

    it('returns undefined for unknown conversation', async () => {
      const result = await client.sendMessage('nonexistent', 'Hello');
      expect(result).toBeUndefined();
    });

    it('passes usage from result to message', async () => {
      const conv = await client.createConversation();
      mockRunFn.mockResolvedValue(makeRunResult('Reply'));

      const result = await client.sendMessage(conv.id, 'Hi');
      expect(result).toBeDefined();
      expect(result!.usage).toEqual({ promptTokens: 50, completionTokens: 30 });
    });

    it('calls runFn with the captain agent', async () => {
      const conv = await client.createConversation();
      mockRunFn.mockResolvedValue(makeRunResult('Response'));

      await client.sendMessage(conv.id, 'Test message');

      expect(mockRunFn).toHaveBeenCalledTimes(1);
      const [agent, content, options] = mockRunFn.mock.calls[0]!;
      // The captain agent should be the one passed to run
      expect(agent).toBeDefined();
      expect(content).toBe('Test message');
      // First call should not have previousResponseId
      expect(options).not.toHaveProperty('previousResponseId');
    });

    it('chains conversation via previousResponseId', async () => {
      const conv = await client.createConversation();
      mockRunFn.mockResolvedValueOnce(makeRunResult('First reply', 'resp_001'));
      mockRunFn.mockResolvedValueOnce(makeRunResult('Second reply', 'resp_002'));

      await client.sendMessage(conv.id, 'First message');
      await client.sendMessage(conv.id, 'Second message');

      expect(mockRunFn).toHaveBeenCalledTimes(2);
      const [, , secondOptions] = mockRunFn.mock.calls[1]!;
      expect(secondOptions).toHaveProperty('previousResponseId', 'resp_001');
    });

    it('extracts text from newItems when finalOutput is not a string', async () => {
      const conv = await client.createConversation();
      mockRunFn.mockResolvedValue({
        finalOutput: undefined,
        newItems: [
          {
            type: 'message_output_item',
            content: 'From items',
            rawItem: { role: 'assistant', content: 'From items' }
          }
        ],
        lastResponseId: 'resp_001',
        history: [],
        state: {
          usage: { requests: 1, inputTokens: 10, outputTokens: 5, totalTokens: 15 }
        }
      });

      const result = await client.sendMessage(conv.id, 'Test');
      expect(result).toBeDefined();
      expect(result!.content).toBe('From items');
    });

    it('captures resolution when a resolution tool is called', async () => {
      const conv = await client.createConversation();

      // The run result includes a tool_call_item with the resolution tool's rawItem.
      // extractResolutionFromItems() scans newItems for resolution tool calls.
      mockRunFn.mockResolvedValue(
        makeRunResult('Ye won the shanty battle!', 'resp_001', {
          resolution: {
            tool: 'resolve_shanty',
            result: { winner: 'user', rounds: 4, best_verse: 'A verse about the sea' }
          }
        })
      );

      const result = await client.sendMessage(conv.id, 'My final verse!');
      expect(result).toBeDefined();
      expect(result!.resolution).toEqual({
        tool: 'resolve_shanty',
        result: { winner: 'user', rounds: 4, best_verse: 'A verse about the sea' }
      });
    });

    it('does not include resolution when no resolution tool is called', async () => {
      const conv = await client.createConversation();
      mockRunFn.mockResolvedValue(makeRunResult('Just a regular message'));

      const result = await client.sendMessage(conv.id, 'Hello');
      expect(result).toBeDefined();
      expect(result!.resolution).toBeUndefined();
    });
  });

  describe('sendMessageStream', () => {
    it('streams delta events and emits complete', async () => {
      const conv = await client.createConversation();
      const streamResult = makeStreamedRunResult(['Hello', ' world'], 'Hello world');
      mockRunFn.mockResolvedValue(streamResult);

      const chunks: string[] = [];
      await client.sendMessageStream(conv.id, 'test', (chunk) => {
        chunks.push(chunk);
      });

      // Should have: 2 deltas + 1 complete
      expect(chunks).toHaveLength(3);

      // Check delta events
      expect(chunks[0]).toContain('event: message.delta');
      expect(chunks[0]).toContain('"content":"Hello"');

      expect(chunks[1]).toContain('event: message.delta');
      expect(chunks[1]).toContain('"content":" world"');

      // Check complete event
      expect(chunks[2]).toContain('event: message.complete');
      expect(chunks[2]).toContain('"content":"Hello world"');
    });

    it('emits error event for unknown conversation', async () => {
      const chunks: string[] = [];
      await client.sendMessageStream('nonexistent', 'test', (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain('event: error');
      expect(chunks[0]).toContain('not_found');
    });

    it('includes usage in complete event', async () => {
      const conv = await client.createConversation();
      const streamResult = makeStreamedRunResult(['Done'], 'Done');
      mockRunFn.mockResolvedValue(streamResult);

      const chunks: string[] = [];
      await client.sendMessageStream(conv.id, 'test', (chunk) => {
        chunks.push(chunk);
      });

      const completeChunk = chunks.find((c) => c.includes('message.complete'));
      expect(completeChunk).toBeDefined();
      expect(completeChunk).toContain('"promptTokens":50');
      expect(completeChunk).toContain('"completionTokens":30');
    });

    it('handles stream errors gracefully', async () => {
      const conv = await client.createConversation();

      mockRunFn.mockRejectedValue(new Error('Stream connection lost'));

      const chunks: string[] = [];
      await client.sendMessageStream(conv.id, 'test', (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toContain('event: error');
      expect(chunks[0]).toContain('Stream connection lost');
    });

    it('chains streaming calls via previousResponseId', async () => {
      const conv = await client.createConversation();

      // First call (non-streaming) to set lastResponseId
      mockRunFn.mockResolvedValueOnce(makeRunResult('First', 'resp_001'));
      await client.sendMessage(conv.id, 'First');

      // Second call (streaming) should include previousResponseId
      const streamResult = makeStreamedRunResult(['Second'], 'Second', 'resp_002');
      mockRunFn.mockResolvedValueOnce(streamResult);

      const chunks: string[] = [];
      await client.sendMessageStream(conv.id, 'Second', (chunk) => {
        chunks.push(chunk);
      });

      expect(mockRunFn).toHaveBeenCalledTimes(2);
      const [, , streamOptions] = mockRunFn.mock.calls[1]!;
      expect(streamOptions).toHaveProperty('previousResponseId', 'resp_001');
    });

    it('emits activity.resolved SSE event when resolution tool fires during streaming', async () => {
      const conv = await client.createConversation();

      // Mock runFn returns a stream with a resolution tool_called event
      // containing rawItem.name and rawItem.arguments — the new detection mechanism.
      const streamResult = makeStreamedRunResult(['Treasure ', 'found!'], 'Treasure found!', 'resp_resolved', {
        resolutionToolCall: {
          name: 'resolve_treasure',
          arguments: JSON.stringify({
            found: true,
            treasure_name: 'Ruby Crown',
            location: 'Cavern of Echoes'
          })
        }
      });
      mockRunFn.mockResolvedValue(streamResult);

      const chunks: string[] = [];
      await client.sendMessageStream(conv.id, 'Open the chest!', (chunk) => {
        chunks.push(chunk);
      });

      // Should have: 2 deltas + 1 activity.resolved + 1 complete
      expect(chunks).toHaveLength(4);

      // Check deltas
      expect(chunks[0]).toContain('event: message.delta');
      expect(chunks[0]).toContain('"content":"Treasure "');

      expect(chunks[1]).toContain('event: message.delta');
      expect(chunks[1]).toContain('"content":"found!"');

      // Check activity.resolved event
      expect(chunks[2]).toContain('event: activity.resolved');
      expect(chunks[2]).toContain('"tool":"resolve_treasure"');
      expect(chunks[2]).toContain('"found":true');
      expect(chunks[2]).toContain('"treasure_name":"Ruby Crown"');

      // Check complete event
      expect(chunks[3]).toContain('event: message.complete');
      expect(chunks[3]).toContain('"content":"Treasure found!"');
    });

    it('does not emit activity.resolved when no resolution tool fires', async () => {
      const conv = await client.createConversation();
      const streamResult = makeStreamedRunResult(['Hello'], 'Hello');
      mockRunFn.mockResolvedValue(streamResult);

      const chunks: string[] = [];
      await client.sendMessageStream(conv.id, 'test', (chunk) => {
        chunks.push(chunk);
      });

      // No activity.resolved event — just delta + complete
      expect(chunks).toHaveLength(2);
      const hasResolved = chunks.some((c) => c.includes('activity.resolved'));
      expect(hasResolved).toBe(false);
    });

    it('emits tool.called and tool.done SSE events for specialist tools', async () => {
      const conv = await client.createConversation();
      const streamResult = makeStreamedRunResult(['Arr'], 'Arr', 'resp_specialist', {
        specialistToolCall: 'shanty_specialist'
      });
      mockRunFn.mockResolvedValue(streamResult);

      const chunks: string[] = [];
      await client.sendMessageStream(conv.id, 'Sing me a shanty', (chunk) => {
        chunks.push(chunk);
      });

      // Should have: 1 delta + 1 tool.called + 1 tool.done + 1 complete = 4
      expect(chunks).toHaveLength(4);

      // Check tool.called event
      expect(chunks[1]).toContain('event: tool.called');
      expect(chunks[1]).toContain('"toolName":"shanty_specialist"');

      // Check tool.done event
      expect(chunks[2]).toContain('event: tool.done');
      expect(chunks[2]).toContain('"toolName":"shanty_specialist"');

      // Check complete event is last
      expect(chunks[3]).toContain('event: message.complete');
    });

    it('does not emit tool.called/tool.done for resolution tools', async () => {
      const conv = await client.createConversation();

      // Use a resolution tool — should NOT trigger specialist SSE events (tool.called/tool.done)
      // but SHOULD emit activity.resolved
      const streamResult = makeStreamedRunResult(['Done'], 'Done', 'resp_res', {
        resolutionToolCall: {
          name: 'resolve_shanty',
          arguments: JSON.stringify({ winner: 'user', rounds: 3, best_verse: 'A fine verse' })
        }
      });
      mockRunFn.mockResolvedValue(streamResult);

      const chunks: string[] = [];
      await client.sendMessageStream(conv.id, 'End it!', (chunk) => {
        chunks.push(chunk);
      });

      // Should NOT have tool.called or tool.done
      const hasToolCalled = chunks.some((c) => c.includes('tool.called'));
      const hasToolDone = chunks.some((c) => c.includes('tool.done'));
      expect(hasToolCalled).toBe(false);
      expect(hasToolDone).toBe(false);

      // Should have activity.resolved
      const hasResolved = chunks.some((c) => c.includes('activity.resolved'));
      expect(hasResolved).toBe(true);
    });

    it('emits tool.called/tool.done for all three specialist tools', async () => {
      for (const toolName of ['shanty_specialist', 'treasure_specialist', 'crew_specialist']) {
        const conv = await client.createConversation();
        const streamResult = makeStreamedRunResult(['Response'], 'Response', `resp_${toolName}`, {
          specialistToolCall: toolName
        });
        mockRunFn.mockResolvedValue(streamResult);

        const chunks: string[] = [];
        await client.sendMessageStream(conv.id, 'test', (chunk) => {
          chunks.push(chunk);
        });

        const toolCalledChunk = chunks.find((c) => c.includes('tool.called'));
        const toolDoneChunk = chunks.find((c) => c.includes('tool.done'));
        expect(toolCalledChunk).toBeDefined();
        expect(toolCalledChunk).toContain(`"toolName":"${toolName}"`);
        expect(toolDoneChunk).toBeDefined();
        expect(toolDoneChunk).toContain(`"toolName":"${toolName}"`);
      }
    });
  });

  describe('checkHealth', () => {
    it('returns healthy when client is initialised', async () => {
      const health = await client.checkHealth();
      expect(health.status).toBe('healthy');
      expect(health.checks).toHaveLength(1);
      expect(health.checks![0]!.name).toBe('azure-openai');
      expect(health.checks![0]!.status).toBe('healthy');
      expect(health.checks![0]!.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('returns degraded when client is not initialised', async () => {
      const uninitClient = new OpenAIClient({
        config: TEST_CONFIG,
        runFn: mockRunFn,
        skipClientSetup: true
      });
      // Don't call initialise

      const health = await uninitClient.checkHealth();
      expect(health.status).toBe('degraded');
      expect(health.checks![0]!.status).toBe('unhealthy');
    });
  });
});
