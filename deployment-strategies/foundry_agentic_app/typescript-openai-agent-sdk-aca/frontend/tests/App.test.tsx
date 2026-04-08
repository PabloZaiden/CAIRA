/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { App } from '../src/App.tsx';
import type { AdventureList, AdventureStarted, AdventureDetail } from '../src/types.ts';

// ---- Mock data ----

const EMPTY_LIST: AdventureList = {
  adventures: [],
  offset: 0,
  limit: 50,
  total: 0
};

function makeAdventureStarted(mode: 'shanty' | 'treasure' | 'crew', id: string): AdventureStarted {
  return {
    id,
    mode,
    status: 'active',
    syntheticMessage: `Start a ${mode} adventure!`,
    createdAt: '2026-01-01T00:00:00Z'
  };
}

function makeAdventureDetail(mode: 'shanty' | 'treasure' | 'crew', id: string): AdventureDetail {
  return {
    id,
    mode,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    lastParleyAt: '2026-01-01T00:00:00Z',
    messageCount: 1,
    parleys: [
      {
        id: `msg-${id}`,
        role: 'assistant',
        content: `Welcome to your ${mode} adventure!`,
        createdAt: '2026-01-01T00:00:00Z'
      }
    ]
  };
}

// ---- Mock PirateClient via module mock ----

const mockStartShanty = vi.fn();
const mockSeekTreasure = vi.fn();
const mockEnlistInCrew = vi.fn();
const mockListAdventures = vi.fn();
const mockGetAdventure = vi.fn();
const mockParleyStream = vi.fn();
const mockGetStats = vi.fn();
const mockGetHealth = vi.fn();
const mockParley = vi.fn();

vi.mock('../src/api/pirate-client.ts', () => ({
  PirateClient: vi.fn().mockImplementation(() => ({
    startShanty: mockStartShanty,
    seekTreasure: mockSeekTreasure,
    enlistInCrew: mockEnlistInCrew,
    listAdventures: mockListAdventures,
    getAdventure: mockGetAdventure,
    parleyStream: mockParleyStream,
    getStats: mockGetStats,
    getHealth: mockGetHealth,
    parley: mockParley
  }))
}));

// Helper: create a mock SSE stream that yields a complete message
function makeMockStream(mode: string) {
  return async function* () {
    yield {
      type: 'complete' as const,
      message: {
        id: `resp-${mode}`,
        role: 'assistant' as const,
        content: `Welcome to your ${mode} adventure!`,
        createdAt: '2026-01-01T00:00:01Z'
      }
    };
  };
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAdventures.mockResolvedValue(EMPTY_LIST);
    mockGetAdventure.mockResolvedValue(makeAdventureDetail('shanty', 'adv-1'));
    // Default: parleyStream returns a valid async generator for any call
    mockParleyStream.mockImplementation((_id: string, _msg: string) => {
      return makeMockStream('shanty')();
    });
  });

  it('renders header and activity picker', async () => {
    render(<App />);

    expect(screen.getByText('Account Team Workspace')).toBeInTheDocument();
    expect(screen.getByTestId('activity-picker')).toBeInTheDocument();
    expect(screen.getByTestId('no-selection')).toBeInTheDocument();
  });

  it('loads adventures on mount', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockListAdventures).toHaveBeenCalledWith(0, 50);
    });
  });

  it('clicking Sea Shanty Battle calls startShanty and shows conversation', async () => {
    const started = makeAdventureStarted('shanty', 'adv-shanty');
    mockStartShanty.mockResolvedValue(started);

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('activity-btn-shanty')).toBeEnabled();
    });

    await user.click(screen.getByTestId('activity-btn-shanty'));

    await waitFor(() => {
      expect(mockStartShanty).toHaveBeenCalledTimes(1);
    });

    // Adventure should be selected — no-selection placeholder should be gone
    await waitFor(() => {
      expect(screen.queryByTestId('no-selection')).not.toBeInTheDocument();
    });
  });

  it('clicking Seek Treasure calls seekTreasure', async () => {
    const started = makeAdventureStarted('treasure', 'adv-treasure');
    mockSeekTreasure.mockResolvedValue(started);

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('activity-btn-treasure')).toBeEnabled();
    });

    await user.click(screen.getByTestId('activity-btn-treasure'));

    await waitFor(() => {
      expect(mockSeekTreasure).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('no-selection')).not.toBeInTheDocument();
    });
  });

  it('clicking Join the Crew calls enlistInCrew', async () => {
    const started = makeAdventureStarted('crew', 'adv-crew');
    mockEnlistInCrew.mockResolvedValue(started);

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('activity-btn-crew')).toBeEnabled();
    });

    await user.click(screen.getByTestId('activity-btn-crew'));

    await waitFor(() => {
      expect(mockEnlistInCrew).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('no-selection')).not.toBeInTheDocument();
    });
  });

  it('shows error banner when startAdventure fails', async () => {
    mockStartShanty.mockRejectedValue(new Error('API error 500: internal_error'));

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('activity-btn-shanty')).toBeEnabled();
    });

    await user.click(screen.getByTestId('activity-btn-shanty'));

    await waitFor(() => {
      expect(screen.getByTestId('adventure-error')).toBeInTheDocument();
      expect(screen.getByText('API error 500: internal_error')).toBeInTheDocument();
    });
  });

  it('shows error banner when listAdventures fails on mount', async () => {
    mockListAdventures.mockRejectedValue(new Error('Network error'));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('adventure-error')).toBeInTheDocument();
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('does not show error banner when there is no error', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockListAdventures).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('adventure-error')).not.toBeInTheDocument();
  });

  it('disables activity buttons while loading', () => {
    // listAdventures never resolves -> stays in loading state
    mockListAdventures.mockReturnValue(new Promise(() => {}));

    render(<App />);

    expect(screen.getByTestId('activity-btn-shanty')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-treasure')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-crew')).toBeDisabled();
  });

  it('new adventure appears in conversation list after starting', async () => {
    const started = makeAdventureStarted('shanty', 'adv-shanty-1');
    mockStartShanty.mockResolvedValue(started);

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('activity-btn-shanty')).toBeEnabled();
    });

    await user.click(screen.getByTestId('activity-btn-shanty'));

    // The ConversationList should now contain the new adventure item
    await waitFor(() => {
      expect(screen.getByTestId('conversation-item-adv-shanty-1')).toBeInTheDocument();
    });
  });

  it('error banner has alert role for accessibility', async () => {
    mockListAdventures.mockRejectedValue(new Error('Connection refused'));

    render(<App />);

    await waitFor(() => {
      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent('Connection refused');
    });
  });

  it('renders stream toggle in the header', async () => {
    render(<App />);

    expect(screen.getByTestId('stream-toggle')).toBeInTheDocument();
    // Defaults to streaming mode
    expect(screen.getByText('Streaming')).toBeInTheDocument();
  });

  it('toggles between streaming and JSON mode', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Starts in streaming mode
    expect(screen.getByText('Streaming')).toBeInTheDocument();
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    // Click to switch to JSON mode
    await user.click(toggle);

    expect(screen.getByText('JSON')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    // Click again to switch back to streaming
    await user.click(toggle);

    expect(screen.getByText('Streaming')).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('shows loading spinner on activity button while starting', async () => {
    // Make startShanty hang so we can see the loading state
    let resolveStart!: (value: any) => void;
    mockStartShanty.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      })
    );

    const user = userEvent.setup();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('activity-btn-shanty')).toBeEnabled();
    });

    await user.click(screen.getByTestId('activity-btn-shanty'));

    // The shanty button should now show a loading spinner
    await waitFor(() => {
      expect(screen.getByTestId('activity-loading-shanty')).toBeInTheDocument();
      expect(screen.getByText('Starting...')).toBeInTheDocument();
    });

    // All buttons should be disabled
    expect(screen.getByTestId('activity-btn-shanty')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-treasure')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-crew')).toBeDisabled();

    // Resolve to clean up
    resolveStart(makeAdventureStarted('shanty', 'adv-shanty'));

    await waitFor(() => {
      expect(screen.queryByTestId('activity-loading-shanty')).not.toBeInTheDocument();
    });
  });
});
