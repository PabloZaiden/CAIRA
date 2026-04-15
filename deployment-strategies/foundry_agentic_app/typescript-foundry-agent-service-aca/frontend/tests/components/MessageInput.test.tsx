import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { MessageInput } from '../../src/components/MessageInput.tsx';

describe('MessageInput', () => {
  it('renders textarea and send button', () => {
    render(<MessageInput onSend={vi.fn()} />);
    expect(screen.getByTestId('message-input-textarea')).toBeInTheDocument();
    expect(screen.getByTestId('message-input-send')).toBeInTheDocument();
  });

  it('calls onSend with trimmed text on submit', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByTestId('message-input-textarea');
    await user.type(textarea, '  Hello!  ');
    await user.click(screen.getByTestId('message-input-send'));

    expect(onSend).toHaveBeenCalledWith('Hello!');
  });

  it('clears input after send', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByTestId('message-input-textarea') as HTMLTextAreaElement;
    await user.type(textarea, 'Hello');
    await user.click(screen.getByTestId('message-input-send'));

    expect(textarea.value).toBe('');
  });

  it('does not call onSend with empty text', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageInput onSend={onSend} />);

    await user.click(screen.getByTestId('message-input-send'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('disables input and button when disabled prop is true', () => {
    render(<MessageInput onSend={vi.fn()} disabled={true} />);
    expect(screen.getByTestId('message-input-textarea')).toBeDisabled();
    expect(screen.getByTestId('message-input-send')).toBeDisabled();
  });

  it('sends on Enter key (without Shift)', async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByTestId('message-input-textarea');
    await user.type(textarea, 'Arr!{Enter}');

    expect(onSend).toHaveBeenCalledWith('Arr!');
  });

  it('shows "Activity complete" when resolved prop is true', () => {
    render(<MessageInput onSend={vi.fn()} resolved={true} />);

    expect(screen.getByTestId('message-input-resolved')).toBeInTheDocument();
    expect(screen.getByText('Activity complete')).toBeInTheDocument();

    // Should not render the form
    expect(screen.queryByTestId('message-input-form')).not.toBeInTheDocument();
    expect(screen.queryByTestId('message-input-textarea')).not.toBeInTheDocument();
  });

  it('shows the form when resolved prop is false', () => {
    render(<MessageInput onSend={vi.fn()} resolved={false} />);

    expect(screen.getByTestId('message-input-form')).toBeInTheDocument();
    expect(screen.queryByTestId('message-input-resolved')).not.toBeInTheDocument();
  });
});
