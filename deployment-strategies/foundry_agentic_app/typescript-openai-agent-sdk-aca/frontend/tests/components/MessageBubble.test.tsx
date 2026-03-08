import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageBubble } from '../../src/components/MessageBubble.tsx';
import type { ParleyMessage } from '../../src/types.ts';

const USER_MESSAGE: ParleyMessage = {
  id: 'msg-1',
  role: 'user',
  content: 'Ahoy there!',
  createdAt: '2026-01-01T12:00:00Z'
};

const ASSISTANT_MESSAGE: ParleyMessage = {
  id: 'msg-2',
  role: 'assistant',
  content: 'Arr, welcome aboard, matey!',
  createdAt: '2026-01-01T12:00:01Z'
};

describe('MessageBubble', () => {
  it('renders user message with correct role label', () => {
    render(<MessageBubble message={USER_MESSAGE} />);
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Ahoy there!')).toBeInTheDocument();
  });

  it('renders assistant message with Captain label', () => {
    render(<MessageBubble message={ASSISTANT_MESSAGE} />);
    expect(screen.getByText('Captain')).toBeInTheDocument();
    expect(screen.getByText('Arr, welcome aboard, matey!')).toBeInTheDocument();
  });

  it('applies user styling for user messages', () => {
    render(<MessageBubble message={USER_MESSAGE} />);
    const bubble = screen.getByTestId('message-msg-1');
    expect(bubble.getAttribute('data-role')).toBe('user');
  });

  it('applies assistant styling for assistant messages', () => {
    render(<MessageBubble message={ASSISTANT_MESSAGE} />);
    const bubble = screen.getByTestId('message-msg-2');
    expect(bubble.getAttribute('data-role')).toBe('assistant');
  });

  it('displays formatted time', () => {
    render(<MessageBubble message={USER_MESSAGE} />);
    // The bubble's last child div contains the time string
    const bubble = screen.getByTestId('message-msg-1');
    // Time element is the last child div — it should have some text content
    const timeEl = bubble.querySelector('div:last-child');
    expect(timeEl).toBeInTheDocument();
    expect(timeEl?.textContent).toBeTruthy();
  });
});
