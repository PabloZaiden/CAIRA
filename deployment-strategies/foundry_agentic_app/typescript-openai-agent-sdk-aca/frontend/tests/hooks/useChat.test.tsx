/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../../src/hooks/useChat.ts';
import { useConversationStates } from '../../src/hooks/useConversationStates.ts';
import type { ActivityClient } from '../../src/api/activity-client.ts';
import type { AdventureDetail, SSEEvent } from '../../src/types.ts';

const ADVENTURE_DETAIL: AdventureDetail = {
  id: 'adv-1',
  mode: 'discovery',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  lastParleyAt: '2026-01-02T00:00:00Z',
  messageCount: 2,
  parleys: [
    { id: 'msg-1', role: 'user', content: 'Ahoy!', createdAt: '2026-01-01T12:00:00Z' },
    { id: 'msg-2', role: 'assistant', content: 'Welcome!', createdAt: '2026-01-01T12:00:01Z' }
  ]
};

const RESOLVED_DETAIL: AdventureDetail = {
  ...ADVENTURE_DETAIL,
  status: 'resolved',
  outcome: {
    tool: 'resolve_discovery',
    result: { winner: 'user', rounds: 4, primary_need: 'Through storms we sail' }
  }
};

function createMockClient(): ActivityClient {
  return {
    listAdventures: vi.fn(),
    startDiscovery: vi.fn(),
    startPlanning: vi.fn(),
    startStaffing: vi.fn(),
    getAdventure: vi.fn().mockResolvedValue(ADVENTURE_DETAIL),
    parley: vi.fn(),
    parleyStream: vi.fn(),
    getStats: vi.fn(),
    getHealth: vi.fn()
  } as any;
}

/**
 * Integration wrapper: renders both useConversationStates and useChat together.
 * This mirrors how App.tsx uses them.
 */
function useIntegrated(
  client: ActivityClient,
  conversationId: string | null,
  options: {
    streaming?: boolean;
    pendingFirstMessage?: string | null;
    onPendingFirstMessageConsumed?: () => void;
  } = {}
) {
  const streaming = options.streaming !== false;
  const store = useConversationStates(client, { streaming });
  const chat = useChat(store, conversationId, {
    streaming,
    ...('pendingFirstMessage' in options ? { pendingFirstMessage: options.pendingFirstMessage ?? null } : {}),
    ...(options.onPendingFirstMessageConsumed
      ? { onPendingFirstMessageConsumed: options.onPendingFirstMessageConsumed }
      : {})
  });
  return { ...chat, store };
}

describe('useChat', () => {
  let mockClient: ActivityClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('loads messages when conversationId is set', async () => {
    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.messages).toEqual(ADVENTURE_DETAIL.parleys);
    expect(mockClient.getAdventure).toHaveBeenCalledWith('adv-1');
  });

  it('clears messages when conversationId is null', () => {
    const { result } = renderHook(() => useIntegrated(mockClient, null));
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.outcome).toBeNull();
  });

  it('sets error on load failure', async () => {
    (mockClient.getAdventure as any).mockRejectedValue(new Error('Load failed'));

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Load failed');
  });

  it('loads outcome from adventure detail on mount', async () => {
    (mockClient.getAdventure as any).mockResolvedValue(RESOLVED_DETAIL);

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.outcome).toEqual(RESOLVED_DETAIL.outcome);
  });

  it('sends message and processes SSE stream', async () => {
    const sseEvents: SSEEvent[] = [
      { type: 'delta', content: 'Arr, ' },
      { type: 'delta', content: 'welcome!' },
      {
        type: 'complete',
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: 'Arr, welcome!',
          createdAt: '2026-01-02T00:00:00Z'
        }
      }
    ];

    async function* mockStream(): AsyncGenerator<SSEEvent> {
      for (const event of sseEvents) {
        yield event;
      }
    }

    (mockClient.parleyStream as any).mockReturnValue(mockStream());

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('Ahoy!');
    });

    // Should have original messages + user message + assistant message
    expect(result.current.messages).toHaveLength(4);
    const lastMsg = result.current.messages[
      result.current.messages.length - 1
    ] as (typeof result.current.messages)[number];
    expect(lastMsg).toBeDefined();
    expect(lastMsg.role).toBe('assistant');
    expect(lastMsg.content).toBe('Arr, welcome!');
    expect(result.current.streamingContent).toBe('');
  });

  it('handles activity.resolved SSE event during streaming', async () => {
    const sseEvents: SSEEvent[] = [
      { type: 'delta', content: 'You win!' },
      {
        type: 'activity.resolved',
        outcome: {
          tool: 'resolve_discovery',
          result: { winner: 'user', rounds: 4, primary_need: 'My verse' }
        }
      },
      {
        type: 'complete',
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: 'You win!',
          createdAt: '2026-01-02T00:00:00Z'
        }
      }
    ];

    async function* mockStream(): AsyncGenerator<SSEEvent> {
      for (const event of sseEvents) {
        yield event;
      }
    }

    (mockClient.parleyStream as any).mockReturnValue(mockStream());

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('Sing me a discovery');
    });

    expect(result.current.outcome).toEqual({
      tool: 'resolve_discovery',
      result: { winner: 'user', rounds: 4, primary_need: 'My verse' }
    });
  });

  it('handles SSE error events', async () => {
    async function* mockStream(): AsyncGenerator<SSEEvent> {
      yield { type: 'error', code: 'agent_error', message: 'The seas be rough' };
    }

    (mockClient.parleyStream as any).mockReturnValue(mockStream());

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('Ahoy!');
    });

    expect(result.current.error).toBe('The seas be rough');
  });

  it('handles send failure', async () => {
    (mockClient.parleyStream as any).mockImplementation(() => {
      throw new Error('Network error');
    });

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('Ahoy!');
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.streamingContent).toBe('');
  });

  it('does nothing when sending with null conversationId', async () => {
    const { result } = renderHook(() => useIntegrated(mockClient, null));

    await act(async () => {
      await result.current.sendMessage('Ahoy!');
    });

    expect(mockClient.parleyStream).not.toHaveBeenCalled();
    expect(mockClient.parley).not.toHaveBeenCalled();
  });

  // ---- Non-streaming (JSON) mode tests ----

  it('sends message via JSON parley() when streaming is false', async () => {
    const response = {
      id: 'msg-3',
      role: 'assistant' as const,
      content: 'Arr, welcome aboard!',
      createdAt: '2026-01-02T00:00:00Z'
    };
    (mockClient.parley as any).mockResolvedValue(response);

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1', { streaming: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('Ahoy!');
    });

    expect(mockClient.parley).toHaveBeenCalledWith('adv-1', 'Ahoy!');
    expect(mockClient.parleyStream).not.toHaveBeenCalled();

    // Should have original messages + user message + assistant message
    expect(result.current.messages).toHaveLength(4);
    const lastMsg = result.current.messages.at(-1);
    expect(lastMsg?.role).toBe('assistant');
    expect(lastMsg?.content).toBe('Arr, welcome aboard!');
    expect(result.current.streamingContent).toBe('');
  });

  it('handles resolution in JSON parley() response', async () => {
    const response = {
      id: 'msg-3',
      role: 'assistant' as const,
      content: 'You won the discovery battle!',
      createdAt: '2026-01-02T00:00:00Z',
      resolution: {
        tool: 'resolve_discovery',
        result: { winner: 'user', rounds: 3 }
      }
    };
    (mockClient.parley as any).mockResolvedValue(response);

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1', { streaming: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('Sing louder!');
    });

    expect(result.current.outcome).toEqual({
      tool: 'resolve_discovery',
      result: { winner: 'user', rounds: 3 }
    });
  });

  it('handles send failure in non-streaming mode', async () => {
    (mockClient.parley as any).mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1', { streaming: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('Ahoy!');
    });

    expect(result.current.error).toBe('Server error');
  });

  it('does nothing in non-streaming mode with null conversationId', async () => {
    const { result } = renderHook(() => useIntegrated(mockClient, null, { streaming: false }));

    await act(async () => {
      await result.current.sendMessage('Ahoy!');
    });

    expect(mockClient.parley).not.toHaveBeenCalled();
    expect(mockClient.parleyStream).not.toHaveBeenCalled();
  });

  // ---- Empty message filtering tests ----

  it('does not add empty assistant message from streaming complete event', async () => {
    const sseEvents: SSEEvent[] = [
      {
        type: 'activity.resolved',
        outcome: {
          tool: 'resolve_discovery',
          result: { winner: 'user', rounds: 3, primary_need: 'A fine verse' }
        }
      },
      {
        type: 'complete',
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: '',
          createdAt: '2026-01-02T00:00:00Z'
        }
      }
    ];

    async function* mockStream(): AsyncGenerator<SSEEvent> {
      for (const event of sseEvents) {
        yield event;
      }
    }

    (mockClient.parleyStream as any).mockReturnValue(mockStream());

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('My final verse!');
    });

    // Should have original 2 messages + user message, but NOT the empty assistant message
    expect(result.current.messages).toHaveLength(3);
    const lastMsg = result.current.messages.at(-1);
    expect(lastMsg?.role).toBe('user');
    // Resolution should still be captured
    expect(result.current.outcome).toEqual({
      tool: 'resolve_discovery',
      result: { winner: 'user', rounds: 3, primary_need: 'A fine verse' }
    });
  });

  it('does not add empty assistant message from JSON parley response', async () => {
    const response = {
      id: 'msg-3',
      role: 'assistant' as const,
      content: '',
      createdAt: '2026-01-02T00:00:00Z',
      resolution: {
        tool: 'resolve_staffing',
        result: { rank: 'Quartermaster', role: 'navigator', team_name: 'The Agentic' }
      }
    };
    (mockClient.parley as any).mockResolvedValue(response);

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1', { streaming: false }));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.sendMessage('I am ready to serve!');
    });

    // Should have original 2 messages + user message, but NOT the empty assistant message
    expect(result.current.messages).toHaveLength(3);
    const lastMsg = result.current.messages.at(-1);
    expect(lastMsg?.role).toBe('user');
    // Resolution should still be captured
    expect(result.current.outcome).toEqual({
      tool: 'resolve_staffing',
      result: { rank: 'Quartermaster', role: 'navigator', team_name: 'The Agentic' }
    });
  });

  it('filters empty assistant messages from loaded conversation history', async () => {
    const detailWithEmpty: AdventureDetail = {
      ...ADVENTURE_DETAIL,
      parleys: [
        { id: 'msg-1', role: 'user', content: 'Ahoy!', createdAt: '2026-01-01T12:00:00Z' },
        { id: 'msg-2', role: 'assistant', content: 'Welcome!', createdAt: '2026-01-01T12:00:01Z' },
        { id: 'msg-3', role: 'user', content: 'Sing!', createdAt: '2026-01-01T12:00:02Z' },
        { id: 'msg-4', role: 'assistant', content: '', createdAt: '2026-01-01T12:00:03Z' }
      ]
    };
    (mockClient.getAdventure as any).mockResolvedValue(detailWithEmpty);

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Empty assistant message should be filtered out
    expect(result.current.messages).toHaveLength(3);
    expect(result.current.messages.every((m) => m.content.length > 0)).toBe(true);
  });

  // ---- Specialist activity indicator tests ----

  it('sets activeSpecialist on tool.called and clears on tool.done', async () => {
    const sseEvents: SSEEvent[] = [
      { type: 'tool.called', toolName: 'discovery_specialist' },
      { type: 'delta', content: 'A discovery for ye!' },
      { type: 'tool.done', toolName: 'discovery_specialist' },
      {
        type: 'complete',
        message: {
          id: 'msg-3',
          role: 'assistant',
          content: 'A discovery for ye!',
          createdAt: '2026-01-02T00:00:00Z'
        }
      }
    ];

    async function* mockStream(): AsyncGenerator<SSEEvent> {
      for (const event of sseEvents) {
        yield event;
      }
    }

    (mockClient.parleyStream as any).mockReturnValue(mockStream());

    const { result } = renderHook(() => useIntegrated(mockClient, 'adv-1'));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Before sending, activeSpecialist should be null
    expect(result.current.activeSpecialist).toBeNull();

    await act(async () => {
      await result.current.sendMessage('Sing me a discovery!');
    });

    // After stream completes, activeSpecialist should be cleared
    expect(result.current.activeSpecialist).toBeNull();
  });

  it('clears activeSpecialist when conversationId becomes null', async () => {
    const { result, rerender } = renderHook(
      ({ convId }: { convId: string | null }) => useIntegrated(mockClient, convId),
      { initialProps: { convId: 'adv-1' as string | null } }
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Set conversationId to null
    rerender({ convId: null });

    expect(result.current.activeSpecialist).toBeNull();
  });

  it('exposes activeSpecialist in return value', () => {
    const { result } = renderHook(() => useIntegrated(mockClient, null));
    expect(result.current).toHaveProperty('activeSpecialist');
    expect(result.current.activeSpecialist).toBeNull();
  });

  // ---- Pending first message (streaming) tests ----

  it('streams first message via parleyStream when pendingFirstMessage is set', async () => {
    const sseEvents: SSEEvent[] = [
      { type: 'delta', content: 'Arr, ' },
      { type: 'delta', content: 'welcome!' },
      {
        type: 'complete',
        message: {
          id: 'msg-opening',
          role: 'assistant',
          content: 'Arr, welcome!',
          createdAt: '2026-01-02T00:00:00Z'
        }
      }
    ];

    async function* mockStream(): AsyncGenerator<SSEEvent> {
      for (const event of sseEvents) {
        yield event;
      }
    }

    (mockClient.parleyStream as any).mockReturnValue(mockStream());

    const onConsumed = vi.fn();
    const { result } = renderHook(() =>
      useIntegrated(mockClient, 'adv-new', {
        pendingFirstMessage: 'Start a discovery!',
        onPendingFirstMessageConsumed: onConsumed
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should NOT have called getAdventure — used streaming path instead
    expect(mockClient.getAdventure).not.toHaveBeenCalled();

    // Should have called parleyStream with the pending message
    expect(mockClient.parleyStream).toHaveBeenCalledWith('adv-new', 'Start a discovery!', expect.any(AbortSignal));

    // Should have the user message + the assistant response
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.role).toBe('user');
    expect(result.current.messages[0]?.content).toBe('Start a discovery!');
    expect(result.current.messages[1]?.role).toBe('assistant');
    expect(result.current.messages[1]?.content).toBe('Arr, welcome!');

    // onConsumed should have been called to clear the pending message
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it('sends first message via JSON parley() when pendingFirstMessage is set and streaming is false', async () => {
    const response = {
      id: 'msg-opening',
      role: 'assistant' as const,
      content: 'Arr, welcome aboard!',
      createdAt: '2026-01-02T00:00:00Z'
    };
    (mockClient.parley as any).mockResolvedValue(response);

    const onConsumed = vi.fn();
    const { result } = renderHook(() =>
      useIntegrated(mockClient, 'adv-new', {
        streaming: false,
        pendingFirstMessage: 'Start a discovery!',
        onPendingFirstMessageConsumed: onConsumed
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should NOT have called getAdventure
    expect(mockClient.getAdventure).not.toHaveBeenCalled();

    // Should have called parley (JSON) with the pending message
    expect(mockClient.parley).toHaveBeenCalledWith('adv-new', 'Start a discovery!');

    // Should have user message + assistant response
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]?.role).toBe('user');
    expect(result.current.messages[0]?.content).toBe('Start a discovery!');
    expect(result.current.messages[1]?.role).toBe('assistant');
    expect(result.current.messages[1]?.content).toBe('Arr, welcome aboard!');

    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  it('falls back to getAdventure when pendingFirstMessage is null', async () => {
    const { result } = renderHook(() =>
      useIntegrated(mockClient, 'adv-1', {
        pendingFirstMessage: null
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have called getAdventure normally
    expect(mockClient.getAdventure).toHaveBeenCalledWith('adv-1');
    expect(mockClient.parleyStream).not.toHaveBeenCalled();
    expect(mockClient.parley).not.toHaveBeenCalled();
  });

  it('handles streaming error during first message', async () => {
    (mockClient.parleyStream as any).mockImplementation(() => {
      throw new Error('Stream failed');
    });

    const onConsumed = vi.fn();
    const { result } = renderHook(() =>
      useIntegrated(mockClient, 'adv-new', {
        pendingFirstMessage: 'Start a discovery!',
        onPendingFirstMessageConsumed: onConsumed
      })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Stream failed');
    // onConsumed should still have been called (the message was consumed, just the stream failed)
    expect(onConsumed).toHaveBeenCalledTimes(1);
  });

  // ---- Per-conversation independence tests ----

  it('preserves conversation state when switching away and back', async () => {
    const { result, rerender } = renderHook(
      ({ convId }: { convId: string | null }) => useIntegrated(mockClient, convId),
      { initialProps: { convId: 'adv-1' as string | null } }
    );

    // Wait for messages to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.messages).toEqual(ADVENTURE_DETAIL.parleys);

    // Switch away
    rerender({ convId: null });
    expect(result.current.messages).toEqual([]);

    // Switch back — should NOT re-fetch, messages should be cached
    (mockClient.getAdventure as any).mockClear();
    rerender({ convId: 'adv-1' });

    // Messages should be available immediately (cached)
    expect(result.current.messages).toEqual(ADVENTURE_DETAIL.parleys);
    // Should not have called getAdventure again
    expect(mockClient.getAdventure).not.toHaveBeenCalled();
  });
});
