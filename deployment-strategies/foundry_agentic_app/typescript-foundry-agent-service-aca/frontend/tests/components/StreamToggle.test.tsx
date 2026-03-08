import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { StreamToggle } from '../../src/components/StreamToggle.tsx';

describe('StreamToggle', () => {
  it('renders with streaming label when streaming is true', () => {
    render(<StreamToggle streaming={true} onChange={vi.fn()} />);

    expect(screen.getByTestId('stream-toggle')).toBeInTheDocument();
    expect(screen.getByText('Streaming')).toBeInTheDocument();
  });

  it('renders with JSON label when streaming is false', () => {
    render(<StreamToggle streaming={false} onChange={vi.fn()} />);

    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('switch has aria-checked=true when streaming', () => {
    render(<StreamToggle streaming={true} onChange={vi.fn()} />);

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'true');
  });

  it('switch has aria-checked=false when not streaming', () => {
    render(<StreamToggle streaming={false} onChange={vi.fn()} />);

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-checked', 'false');
  });

  it('calls onChange with false when clicked while streaming', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StreamToggle streaming={true} onChange={onChange} />);

    await user.click(screen.getByTestId('stream-toggle-switch'));

    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('calls onChange with true when clicked while not streaming', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StreamToggle streaming={false} onChange={onChange} />);

    await user.click(screen.getByTestId('stream-toggle-switch'));

    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('has accessible label on the switch', () => {
    render(<StreamToggle streaming={true} onChange={vi.fn()} />);

    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveAttribute('aria-label', 'Toggle streaming mode');
  });
});
