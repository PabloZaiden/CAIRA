import { useState } from 'react';

interface MessageInputProps {
  readonly onSend: (message: string) => void;
  readonly disabled?: boolean | undefined;
  /** When true, shows "Adventure complete" instead of the input. */
  readonly resolved?: boolean | undefined;
}

export function MessageInput({ onSend, disabled = false, resolved = false }: MessageInputProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (resolved) {
    return (
      <div
        className='flex items-center justify-center border-t border-zinc-800 bg-zinc-900 px-5 py-4 text-sm text-zinc-500 italic'
        data-testid='message-input-resolved'
      >
        Adventure complete
      </div>
    );
  }

  return (
    <form
      className='flex gap-2 border-t border-zinc-800 bg-zinc-900 px-5 py-3'
      onSubmit={handleSubmit}
      data-testid='message-input-form'
    >
      <textarea
        className='flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-[0.95rem] text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none disabled:opacity-50'
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='Send a message to the captain...'
        disabled={disabled}
        rows={2}
        data-testid='message-input-textarea'
      />
      <button
        type='submit'
        className='cursor-pointer self-end rounded-lg bg-indigo-600 px-5 py-2.5 text-[0.95rem] font-semibold text-white transition-colors hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50'
        disabled={disabled || !text.trim()}
        data-testid='message-input-send'
      >
        Send
      </button>
    </form>
  );
}
