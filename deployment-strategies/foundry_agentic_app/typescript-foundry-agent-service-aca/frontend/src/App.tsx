import { useEffect, useMemo, useState } from 'react';
import { PirateClient } from './api/pirate-client.ts';
import { ActivityPicker } from './components/ActivityPicker.tsx';
import { ConversationList } from './components/ConversationList.tsx';
import { ChatArea } from './components/ChatArea.tsx';
import { MessageInput } from './components/MessageInput.tsx';
import { StreamToggle } from './components/StreamToggle.tsx';
import { useAdventures } from './hooks/useAdventures.ts';
import { useConversationStates } from './hooks/useConversationStates.ts';
import { useChat } from './hooks/useChat.ts';
import './styles/index.css';

export function App() {
  const client = useMemo(
    () =>
      new PirateClient({
        baseUrl: import.meta.env['VITE_API_BASE_URL'] ?? '/api'
      }),
    []
  );

  const {
    adventures,
    selectedId,
    isLoading: isListLoading,
    loadingMode,
    error: adventureError,
    pendingFirstMessage,
    selectAdventure,
    startAdventure,
    clearPendingFirstMessage
  } = useAdventures(client);

  const [streaming, setStreaming] = useState(() => import.meta.env['VITE_USE_STREAMING'] !== 'false');

  const store = useConversationStates(client, { streaming });

  // Clean up all in-flight streams on unmount.
  useEffect(() => {
    return () => {
      store.abortAll();
    };
  }, []);

  const {
    messages,
    streamingContent,
    isLoading: isChatLoading,
    error: chatError,
    outcome,
    activeSpecialist,
    sendMessage
  } = useChat(store, selectedId, {
    streaming,
    pendingFirstMessage,
    onPendingFirstMessageConsumed: clearPendingFirstMessage
  });

  return (
    <div className='flex h-screen flex-col bg-zinc-950' data-testid='app'>
      <header className='flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-3'>
        <h1 className='text-lg font-semibold tracking-wide text-zinc-100'>Account Team Workspace</h1>
        <StreamToggle streaming={streaming} onChange={setStreaming} />
      </header>
      {adventureError && (
        <div
          className='border-b border-red-800 bg-red-950 px-5 py-2 text-sm text-red-300'
          data-testid='adventure-error'
          role='alert'
        >
          {adventureError}
        </div>
      )}
      <div className='flex flex-1 overflow-hidden'>
        <div className='flex w-72 flex-col border-r border-zinc-800 bg-zinc-900'>
          <ActivityPicker
            onStart={(mode) => void startAdventure(mode)}
            disabled={isListLoading}
            loadingMode={loadingMode}
          />
          <ConversationList
            conversations={adventures}
            selectedId={selectedId}
            onSelect={selectAdventure}
            isLoading={isListLoading}
          />
        </div>
        <main className='flex flex-1 flex-col overflow-hidden'>
          {selectedId ? (
            <>
              <ChatArea
                messages={messages}
                streamingContent={streamingContent}
                isLoading={isChatLoading}
                error={chatError}
                outcome={outcome}
                activeSpecialist={activeSpecialist}
              />
              <MessageInput
                onSend={(msg) => void sendMessage(msg)}
                disabled={isChatLoading || outcome != null}
                resolved={outcome != null}
              />
            </>
          ) : (
            <div
              className='flex flex-1 items-center justify-center p-10 text-center text-zinc-500 italic'
              data-testid='no-selection'
            >
              Pick an activity from the sidebar to start a sales/account-team scenario.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
