import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ActivityPicker } from '../../src/components/ActivityPicker.tsx';

describe('ActivityPicker', () => {
  it('renders three activity buttons with correct labels', () => {
    render(<ActivityPicker onStart={() => {}} />);

    expect(screen.getByTestId('activity-btn-discovery')).toBeInTheDocument();
    expect(screen.getByTestId('activity-btn-planning')).toBeInTheDocument();
    expect(screen.getByTestId('activity-btn-staffing')).toBeInTheDocument();

    expect(screen.getByText('Opportunity Discovery')).toBeInTheDocument();
    expect(screen.getByText('Account Planning')).toBeInTheDocument();
    expect(screen.getByText('Team Staffing')).toBeInTheDocument();
  });

  it('renders descriptions for each activity', () => {
    render(<ActivityPicker onStart={() => {}} />);

    expect(screen.getByText('Qualify a new customer opportunity')).toBeInTheDocument();
    expect(screen.getByText('Shape the next account-team engagement plan')).toBeInTheDocument();
    expect(screen.getByText('Assign the right role and coverage plan')).toBeInTheDocument();
  });

  it('calls onStart with "discovery" when Opportunity Discovery is clicked', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ActivityPicker onStart={onStart} />);
    await user.click(screen.getByTestId('activity-btn-discovery'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('discovery');
  });

  it('calls onStart with "planning" when Account Planning is clicked', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ActivityPicker onStart={onStart} />);
    await user.click(screen.getByTestId('activity-btn-planning'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('planning');
  });

  it('calls onStart with "staffing" when Team Staffing is clicked', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ActivityPicker onStart={onStart} />);
    await user.click(screen.getByTestId('activity-btn-staffing'));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledWith('staffing');
  });

  it('disables all buttons when disabled prop is true', () => {
    render(<ActivityPicker onStart={() => {}} disabled={true} />);

    expect(screen.getByTestId('activity-btn-discovery')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-planning')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-staffing')).toBeDisabled();
  });

  it('enables all buttons when disabled prop is false', () => {
    render(<ActivityPicker onStart={() => {}} disabled={false} />);

    expect(screen.getByTestId('activity-btn-discovery')).toBeEnabled();
    expect(screen.getByTestId('activity-btn-planning')).toBeEnabled();
    expect(screen.getByTestId('activity-btn-staffing')).toBeEnabled();
  });

  it('enables all buttons by default (no disabled prop)', () => {
    render(<ActivityPicker onStart={() => {}} />);

    expect(screen.getByTestId('activity-btn-discovery')).toBeEnabled();
    expect(screen.getByTestId('activity-btn-planning')).toBeEnabled();
    expect(screen.getByTestId('activity-btn-staffing')).toBeEnabled();
  });

  it('does not call onStart when a disabled button is clicked', async () => {
    const onStart = vi.fn();
    const user = userEvent.setup();

    render(<ActivityPicker onStart={onStart} disabled={true} />);
    await user.click(screen.getByTestId('activity-btn-discovery'));

    expect(onStart).not.toHaveBeenCalled();
  });

  it('renders with the activity-picker test id container', () => {
    render(<ActivityPicker onStart={() => {}} />);
    expect(screen.getByTestId('activity-picker')).toBeInTheDocument();
  });

  it('shows spinner and "Starting..." on the loading button when loadingMode is set', () => {
    render(<ActivityPicker onStart={() => {}} loadingMode='discovery' />);

    // The loading button should show the spinner indicator
    expect(screen.getByTestId('activity-loading-discovery')).toBeInTheDocument();
    expect(screen.getByText('Starting...')).toBeInTheDocument();

    // The other buttons should still show their normal labels
    expect(screen.getByText('Account Planning')).toBeInTheDocument();
    expect(screen.getByText('Team Staffing')).toBeInTheDocument();

    // The loading button should NOT show its normal label
    expect(screen.queryByText('Opportunity Discovery')).not.toBeInTheDocument();
  });

  it('disables all buttons when loadingMode is set', () => {
    render(<ActivityPicker onStart={() => {}} loadingMode='planning' />);

    expect(screen.getByTestId('activity-btn-discovery')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-planning')).toBeDisabled();
    expect(screen.getByTestId('activity-btn-staffing')).toBeDisabled();
  });

  it('shows spinner on correct button for each mode', () => {
    const { unmount } = render(<ActivityPicker onStart={() => {}} loadingMode='staffing' />);

    expect(screen.getByTestId('activity-loading-staffing')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-loading-discovery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-loading-planning')).not.toBeInTheDocument();

    unmount();
  });

  it('does not show spinner when loadingMode is null', () => {
    render(<ActivityPicker onStart={() => {}} loadingMode={null} />);

    expect(screen.queryByTestId('activity-loading-discovery')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-loading-planning')).not.toBeInTheDocument();
    expect(screen.queryByTestId('activity-loading-staffing')).not.toBeInTheDocument();

    // All labels should be visible
    expect(screen.getByText('Opportunity Discovery')).toBeInTheDocument();
    expect(screen.getByText('Account Planning')).toBeInTheDocument();
    expect(screen.getByText('Team Staffing')).toBeInTheDocument();
  });
});
