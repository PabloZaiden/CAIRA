import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ActivityPicker } from '../../src/components/ActivityPicker.tsx';

describe('ActivityPicker', () => {
  it('renders three activity buttons with correct labels', () => {
    render(<ActivityPicker onStart={() => {}} />);

    expect(screen.getByTestId('activity-btn-shanty')).toBeInTheDocument();
    expect(screen.getByTestId('activity-btn-treasure')).toBeInTheDocument();
    expect(screen.getByTestId('activity-btn-crew')).toBeInTheDocument();

    expect(screen.getByText('Sea Shanty Battle')).toBeInTheDocument();
    expect(screen.getByText('Seek Treasure')).toBeInTheDocument();
    expect(screen.getByText('Join the Crew')).toBeInTheDocument();
  });

  it('renders descriptions for each activity', () => {
    render(<ActivityPicker onStart={() => {}} />);

    expect(screen.getByText('Trade verses in a lyrical duel')).toBeInTheDocument();
    expect(screen.getByText('Hunt for buried pirate treasure')).toBeInTheDocument();
    expect(screen.getByText('Interview for a pirate role')).toBeInTheDocument();
  });

  it('calls onStart with "shanty" when Sea Shanty Battle is clicked', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ActivityPicker onStart={onStart} />);
    await user.click(screen.getByTestId('activity-btn-shanty'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('shanty');
  });

  it('calls onStart with "treasure" when Seek Treasure is clicked', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ActivityPicker onStart={onStart} />);
    await user.click(screen.getByTestId('activity-btn-treasure'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('treasure');
  });

  it('calls onStart with "crew" when Join the Crew is clicked', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ActivityPicker onStart={onStart} />);
    await user.click(screen.getByTestId('activity-btn-crew'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('crew');
  });

  it('disables all buttons when disabled prop is true', () => {
    render(<ActivityPicker onStart={() => {}} disabled={true} />);

    expect(screen.getByTestId('activity-btn-shanty')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-treasure')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-crew')).toBeDisabled();
  });

  it('enables all buttons when disabled prop is false', () => {
    render(<ActivityPicker onStart={() => {}} disabled={false} />);

    expect(screen.getByTestId('activity-btn-shanty')).toBeEnabled();
    expect(screen.getByTestId('activity-btn-treasure')).toBeEnabled();
    expect(screen.getByTestId('activity-btn-crew')).toBeEnabled();
  });

  it('enables all buttons by default (no disabled prop)', () => {
    render(<ActivityPicker onStart={() => {}} />);

    expect(screen.getByTestId('activity-btn-shanty')).toBeEnabled();
    expect(screen.getByTestId('activity-btn-treasure')).toBeEnabled();
    expect(screen.getByTestId('activity-btn-crew')).toBeEnabled();
  });

  it('does not call onStart when a disabled button is clicked', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ActivityPicker onStart={onStart} disabled={true} />);
    await user.click(screen.getByTestId('activity-btn-shanty'));

    expect(onStart).not.toHaveBeenCalled();
  });

  it('renders with the activity-picker test id container', () => {
    render(<ActivityPicker onStart={() => {}} />);
    expect(screen.getByTestId('activity-picker')).toBeInTheDocument();
  });

  it('shows spinner and "Starting..." on the loading button when loadingMode is set', () => {
    render(<ActivityPicker onStart={() => {}} loadingMode='shanty' />);

    // The loading button should show the spinner indicator
    expect(screen.getByTestId('activity-loading-shanty')).toBeInTheDocument();
    expect(screen.getByText('Starting...')).toBeInTheDocument();

    // The other buttons should still show their normal labels
    expect(screen.getByText('Seek Treasure')).toBeInTheDocument();
    expect(screen.getByText('Join the Crew')).toBeInTheDocument();

    // The loading button should NOT show its normal label
    expect(screen.queryByText('Sea Shanty Battle')).not.toBeInTheDocument();
  });

  it('disables all buttons when loadingMode is set', () => {
    render(<ActivityPicker onStart={() => {}} loadingMode='treasure' />);

    expect(screen.getByTestId('activity-btn-shanty')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-treasure')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-crew')).toBeDisabled();
  });

  it('shows spinner on correct button for each mode', () => {
    const { unmount } = render(<ActivityPicker onStart={() => {}} loadingMode='crew' />);

    expect(screen.getByTestId('activity-loading-crew')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-loading-shanty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-loading-treasure')).not.toBeInTheDocument();

    unmount();
  });

  it('does not show spinner when loadingMode is null', () => {
    render(<ActivityPicker onStart={() => {}} loadingMode={null} />);

    expect(screen.queryByTestId('activity-loading-shanty')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-loading-treasure')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-loading-crew')).not.toBeInTheDocument();

    // All labels should be visible
    expect(screen.getByText('Sea Shanty Battle')).toBeInTheDocument();
    expect(screen.getByText('Seek Treasure')).toBeInTheDocument();
    expect(screen.getByText('Join the Crew')).toBeInTheDocument();
  });
});
