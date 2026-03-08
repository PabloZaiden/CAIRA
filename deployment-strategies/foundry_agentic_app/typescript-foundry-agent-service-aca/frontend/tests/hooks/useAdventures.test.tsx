/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdventures } from '../../src/hooks/useAdventures.ts';
import type { PirateClient } from '../../src/api/pirate-client.ts';
import type { AdventureList, Adventure, AdventureStarted } from '../../src/types.ts';

const ADVENTURE: Adventure = {
  id: 'adv-1',
  mode: 'shanty',
  status: 'active',
  createdAt: '2026-01-01T00:00:00Z',
  lastParleyAt: '2026-01-02T00:00:00Z',
  messageCount: 3
};

const ADVENTURE_LIST: AdventureList = {
  adventures: [ADVENTURE],
  offset: 0,
  limit: 50,
  total: 1
};

const ADVENTURE_STARTED: AdventureStarted = {
  id: 'adv-new',
  mode: 'treasure',
  status: 'active',
  syntheticMessage: 'I seek buried treasure! Guide me on a treasure hunting adventure.',
  createdAt: '2026-01-01T00:00:00Z'
};

function createMockClient(): PirateClient {
  return {
    listAdventures: vi.fn().mockResolvedValue(ADVENTURE_LIST),
    startShanty: vi.fn().mockResolvedValue(ADVENTURE_STARTED),
    seekTreasure: vi.fn().mockResolvedValue(ADVENTURE_STARTED),
    enlistInCrew: vi.fn().mockResolvedValue(ADVENTURE_STARTED),
    getAdventure: vi.fn(),
    parley: vi.fn(),
    parleyStream: vi.fn(),
    getStats: vi.fn(),
    getHealth: vi.fn()
  } as any;
}

describe('useAdventures', () => {
  let mockClient: PirateClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it('loads adventures on mount', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.adventures).toEqual([ADVENTURE]);
    expect(mockClient.listAdventures).toHaveBeenCalledWith(0, 50);
  });

  it('starts with loading state', () => {
    (mockClient.listAdventures as any).mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useAdventures(mockClient));
    expect(result.current.isLoading).toBe(true);
  });

  it('sets error on load failure', async () => {
    (mockClient.listAdventures as any).mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Network error');
    expect(result.current.adventures).toEqual([]);
  });

  it('starts a shanty adventure and selects it', async () => {
    const shantyStarted: AdventureStarted = {
      ...ADVENTURE_STARTED,
      mode: 'shanty',
      id: 'adv-shanty'
    };
    (mockClient.startShanty as any).mockResolvedValue(shantyStarted);

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('shanty');
    });

    expect(result.current.selectedId).toBe('adv-shanty');
    expect(result.current.adventures[0]?.id).toBe('adv-shanty');
    expect(result.current.adventures[0]?.mode).toBe('shanty');
    expect(mockClient.startShanty).toHaveBeenCalled();
  });

  it('starts a treasure adventure via seekTreasure', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('treasure');
    });

    expect(mockClient.seekTreasure).toHaveBeenCalled();
    expect(result.current.selectedId).toBe('adv-new');
  });

  it('starts a crew adventure via enlistInCrew', async () => {
    const crewStarted: AdventureStarted = { ...ADVENTURE_STARTED, mode: 'crew', id: 'adv-crew' };
    (mockClient.enlistInCrew as any).mockResolvedValue(crewStarted);

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('crew');
    });

    expect(mockClient.enlistInCrew).toHaveBeenCalled();
    expect(result.current.selectedId).toBe('adv-crew');
  });

  it('sets error on start failure', async () => {
    (mockClient.startShanty as any).mockRejectedValue(new Error('Start failed'));

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('shanty');
    });

    expect(result.current.error).toBe('Start failed');
  });

  it('selects an adventure', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.selectAdventure('adv-1');
    });

    expect(result.current.selectedId).toBe('adv-1');
  });

  it('refreshes adventures', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // First call is from mount
    expect(mockClient.listAdventures).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockClient.listAdventures).toHaveBeenCalledTimes(2);
  });

  it('exposes loadingMode as null when idle', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.loadingMode).toBeNull();
  });

  it('sets loadingMode to the mode being started', async () => {
    // Make startShanty hang so we can observe loadingMode mid-flight
    let resolveStart!: (value: any) => void;
    (mockClient.startShanty as any).mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      })
    );

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Start the adventure (don't await)
    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.startAdventure('shanty');
    });

    // loadingMode should be 'shanty' while in-flight
    expect(result.current.loadingMode).toBe('shanty');

    // Resolve it
    await act(async () => {
      resolveStart(ADVENTURE_STARTED);
      await startPromise;
    });

    // loadingMode should be null after completion
    expect(result.current.loadingMode).toBeNull();
  });

  it('clears loadingMode on start failure', async () => {
    (mockClient.startShanty as any).mockRejectedValue(new Error('Start failed'));

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('shanty');
    });

    expect(result.current.loadingMode).toBeNull();
    expect(result.current.error).toBe('Start failed');
  });

  // ---- pendingFirstMessage tests ----

  it('sets pendingFirstMessage after starting an adventure', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Initially null
    expect(result.current.pendingFirstMessage).toBeNull();

    await act(async () => {
      await result.current.startAdventure('treasure');
    });

    expect(result.current.pendingFirstMessage).toBe(ADVENTURE_STARTED.syntheticMessage);
  });

  it('clearPendingFirstMessage resets pendingFirstMessage to null', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('treasure');
    });

    expect(result.current.pendingFirstMessage).not.toBeNull();

    act(() => {
      result.current.clearPendingFirstMessage();
    });

    expect(result.current.pendingFirstMessage).toBeNull();
  });

  it('does not set pendingFirstMessage on start failure', async () => {
    (mockClient.startShanty as any).mockRejectedValue(new Error('Start failed'));

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('shanty');
    });

    expect(result.current.pendingFirstMessage).toBeNull();
  });

  it('sets messageCount to 0 for a newly started adventure', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('treasure');
    });

    const newAdventure = result.current.adventures.find((a) => a.id === 'adv-new');
    expect(newAdventure).toBeDefined();
    expect(newAdventure?.messageCount).toBe(0);
  });
});
