import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

interface ChatResponse {
  readonly conversationId: string;
  readonly reply: string;
  readonly model: string;
}

function App() {
  const [message, setMessage] = useState('Help me design a simple AI assistant.');
  const [reply, setReply] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function sendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setReply('');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }
      const body = (await response.json()) as ChatResponse;
      setReply(body.reply);
    } catch (error) {
      setReply(error instanceof Error ? error.message : 'Failed to call the API.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main>
      <h1>CAIRA reference chat</h1>
      <p>This frontend is intentionally small: it demonstrates a React UI plus BFF proxy for one API container.</p>
      <form onSubmit={sendMessage}>
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} />
        <button type="submit" disabled={isLoading}>
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </form>
      {reply ? <pre>{reply}</pre> : null}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
