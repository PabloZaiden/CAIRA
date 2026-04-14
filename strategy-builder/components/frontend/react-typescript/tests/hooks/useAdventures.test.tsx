/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAdventures } from '../../src/hooks/useAdventures.ts';
import type { ActivityClient } from '../../src/api/activity-client.ts';
import type { AdventureList, Adventure, AdventureStarted } from '../../src/types.ts';

const ADVENTURE: Adventure = {
  id: 'adv-1',
  mode: 'discovery',
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
  mode: 'planning',
  status: 'active',
  syntheticMessage: 'I seek buried planning! Guide me on a planning hunting adventure.',
  createdAt: '2026-01-01T00:00:00Z'
};

function createMockClient(): ActivityClient {
  return {
    listAdventures: vi.fn().mockResolvedValue(ADVENTURE_LIST),
    startDiscovery: vi.fn().mockResolvedValue(ADVENTURE_STARTED),
    startPlanning: vi.fn().mockResolvedValue(ADVENTURE_STARTED),
    startStaffing: vi.fn().mockResolvedValue(ADVENTURE_STARTED),
    getAdventure: vi.fn(),
    parley: vi.fn(),
    parleyStream: vi.fn(),
    getStats: vi.fn(),
    getHealth: vi.fn()
  } as any;
}

describe('useAdventures', () => {
  let mockClient: ActivityClient;

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

  it('starts a discovery adventure and selects it', async () => {
    const discoveryStarted: AdventureStarted = {
      ...ADVENTURE_STARTED,
      mode: 'discovery',
      id: 'adv-discovery'
    };
    (mockClient.startDiscovery as any).mockResolvedValue(discoveryStarted);

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('discovery');
    });

    expect(result.current.selectedId).toBe('adv-discovery');
    expect(result.current.adventures[0]?.id).toBe('adv-discovery');
    expect(result.current.adventures[0]?.mode).toBe('discovery');
    expect(mockClient.startDiscovery).toHaveBeenCalled();
  });

  it('starts a planning adventure via startPlanning', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('planning');
    });

    expect(mockClient.startPlanning).toHaveBeenCalled();
    expect(result.current.selectedId).toBe('adv-new');
  });

  it('starts a staffing adventure via startStaffing', async () => {
    const staffingStarted: AdventureStarted = { ...ADVENTURE_STARTED, mode: 'staffing', id: 'adv-staffing' };
    (mockClient.startStaffing as any).mockResolvedValue(staffingStarted);

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('staffing');
    });

    expect(mockClient.startStaffing).toHaveBeenCalled();
    expect(result.current.selectedId).toBe('adv-staffing');
  });

  it('sets error on start failure', async () => {
    (mockClient.startDiscovery as any).mockRejectedValue(new Error('Start failed'));

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('discovery');
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
    // Make startDiscovery hang so we can observe loadingMode mid-flight
    let resolveStart!: (value: any) => void;
    (mockClient.startDiscovery as any).mockReturnValue(
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
      startPromise = result.current.startAdventure('discovery');
    });

    // loadingMode should be 'discovery' while in-flight
    expect(result.current.loadingMode).toBe('discovery');

    // Resolve it
    await act(async () => {
      resolveStart(ADVENTURE_STARTED);
      await startPromise;
    });

    // loadingMode should be null after completion
    expect(result.current.loadingMode).toBeNull();
  });

  it('clears loadingMode on start failure', async () => {
    (mockClient.startDiscovery as any).mockRejectedValue(new Error('Start failed'));

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('discovery');
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
      await result.current.startAdventure('planning');
    });

    expect(result.current.pendingFirstMessage).toBe(ADVENTURE_STARTED.syntheticMessage);
  });

  it('clearPendingFirstMessage resets pendingFirstMessage to null', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('planning');
    });

    expect(result.current.pendingFirstMessage).not.toBeNull();

    act(() => {
      result.current.clearPendingFirstMessage();
    });

    expect(result.current.pendingFirstMessage).toBeNull();
  });

  it('does not set pendingFirstMessage on start failure', async () => {
    (mockClient.startDiscovery as any).mockRejectedValue(new Error('Start failed'));

    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('discovery');
    });

    expect(result.current.pendingFirstMessage).toBeNull();
  });

  it('sets messageCount to 0 for a newly started adventure', async () => {
    const { result } = renderHook(() => useAdventures(mockClient));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startAdventure('planning');
    });

    const newAdventure = result.current.adventures.find((a) => a.id === 'adv-new');
    expect(newAdventure).toBeDefined();
    expect(newAdventure?.messageCount).toBe(0);
  });
});
