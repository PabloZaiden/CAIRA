import { useState, useCallback, useEffect } from 'react';
import type { Adventure, AdventureMode } from '../types.ts';
import type { PirateClient } from '../api/pirate-client.ts';

interface UseAdventuresResult {
  readonly adventures: readonly Adventure[];
  readonly selectedId: string | null;
  readonly isLoading: boolean;
  /** The mode currently being started, or null if idle. */
  readonly loadingMode: AdventureMode | null;
  readonly error: string | null;
  /** Synthetic message for a newly started adventure (cleared after consumption). */
  readonly pendingFirstMessage: string | null;
  readonly selectAdventure: (id: string) => void;
  readonly startAdventure: (mode: AdventureMode) => Promise<void>;
  readonly clearPendingFirstMessage: () => void;
  readonly refresh: () => Promise<void>;
}

export function useAdventures(client: PirateClient): UseAdventuresResult {
  const [adventures, setAdventures] = useState<readonly Adventure[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMode, setLoadingMode] = useState<AdventureMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingFirstMessage, setPendingFirstMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await client.listAdventures(0, 50);
      setAdventures(result.adventures);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load adventures';
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  const startAdventure = useCallback(
    async (mode: AdventureMode) => {
      setIsLoading(true);
      setLoadingMode(mode);
      setError(null);
      try {
        let started;
        switch (mode) {
          case 'shanty':
            started = await client.startShanty();
            break;
          case 'treasure':
            started = await client.seekTreasure();
            break;
          case 'crew':
            started = await client.enlistInCrew();
            break;
        }
        const adventure: Adventure = {
          id: started.id,
          mode: started.mode,
          status: started.status,
          createdAt: started.createdAt,
          lastParleyAt: started.createdAt,
          messageCount: 0
        };
        setAdventures((prev) => [adventure, ...prev]);
        // Set the pending first message BEFORE setting selectedId so that
        // useChat can pick it up when it reacts to the conversationId change.
        setPendingFirstMessage(started.syntheticMessage);
        setSelectedId(started.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to start adventure';
        setError(msg);
      } finally {
        setIsLoading(false);
        setLoadingMode(null);
      }
    },
    [client]
  );

  const selectAdventure = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  const clearPendingFirstMessage = useCallback(() => {
    setPendingFirstMessage(null);
  }, []);

  // Load adventures on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    adventures,
    selectedId,
    isLoading,
    loadingMode,
    error,
    pendingFirstMessage,
    selectAdventure,
    startAdventure,
    clearPendingFirstMessage,
    refresh
  };
}
