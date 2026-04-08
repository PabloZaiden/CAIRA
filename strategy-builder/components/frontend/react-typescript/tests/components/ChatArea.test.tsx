import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChatArea } from '../../src/components/ChatArea.tsx';
import type { AdventureOutcome, ParleyMessage } from '../../src/types.ts';

const MESSAGES: ParleyMessage[] = [
  {
    id: 'msg-1',
    role: 'user',
    content: 'Ahoy!',
    createdAt: '2026-01-01T12:00:00Z'
  },
  {
    id: 'msg-2',
    role: 'assistant',
    content: 'Welcome aboard!',
    createdAt: '2026-01-01T12:00:01Z'
  }
];

const SHANTY_OUTCOME: AdventureOutcome = {
  tool: 'resolve_shanty',
  result: { winner: 'user', rounds: 4, best_verse: 'Through storms we sail' }
};

const TREASURE_OUTCOME: AdventureOutcome = {
  tool: 'resolve_treasure',
  result: { found: true, treasure_name: 'Golden Chalice', location: 'Skeleton Cove' }
};

describe('ChatArea', () => {
  it('renders messages', () => {
    render(<ChatArea messages={MESSAGES} streamingContent='' isLoading={false} error={null} />);
    expect(screen.getByText('Ahoy!')).toBeInTheDocument();
    expect(screen.getByText('Welcome aboard!')).toBeInTheDocument();
  });

  it('shows empty state when no messages', () => {
    render(<ChatArea messages={[]} streamingContent='' isLoading={false} error={null} />);
    expect(screen.getByTestId('chat-area-empty')).toBeInTheDocument();
  });

  it('shows loading indicator', () => {
    render(<ChatArea messages={[]} streamingContent='' isLoading={true} error={null} />);
    expect(screen.getByTestId('chat-area-loading')).toBeInTheDocument();
    expect(screen.getByText('The coordinator is thinking...')).toBeInTheDocument();
  });

  it('shows streaming content', () => {
    render(<ChatArea messages={MESSAGES} streamingContent='Arr, let me tell ye...' isLoading={true} error={null} />);
    expect(screen.getByTestId('streaming-message')).toBeInTheDocument();
    expect(screen.getByText('Arr, let me tell ye...')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<ChatArea messages={[]} streamingContent='' isLoading={false} error='Connection lost!' />);
    expect(screen.getByTestId('chat-area-error')).toBeInTheDocument();
    expect(screen.getByText('Connection lost!')).toBeInTheDocument();
  });

  it('does not show loading when streaming content exists', () => {
    render(<ChatArea messages={[]} streamingContent='Streaming...' isLoading={true} error={null} />);
    expect(screen.queryByTestId('chat-area-loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('streaming-message')).toBeInTheDocument();
  });

  // ---- Outcome card tests ----

  it('renders outcome card when outcome is provided', () => {
    render(
      <ChatArea messages={MESSAGES} streamingContent='' isLoading={false} error={null} outcome={SHANTY_OUTCOME} />
    );
    expect(screen.getByTestId('outcome-card')).toBeInTheDocument();
    expect(screen.getByText('Discovery Summary')).toBeInTheDocument();
  });

  it('does not render outcome card when outcome is null', () => {
    render(<ChatArea messages={MESSAGES} streamingContent='' isLoading={false} error={null} outcome={null} />);
    expect(screen.queryByTestId('outcome-card')).not.toBeInTheDocument();
  });

  it('renders outcome card with treasure result details', () => {
    render(
      <ChatArea messages={MESSAGES} streamingContent='' isLoading={false} error={null} outcome={TREASURE_OUTCOME} />
    );
    expect(screen.getByText('Account Plan Summary')).toBeInTheDocument();
    const details = screen.getByTestId('outcome-details');
    expect(details).toBeInTheDocument();
    expect(screen.getByText('Golden Chalice')).toBeInTheDocument();
    expect(screen.getByText('Skeleton Cove')).toBeInTheDocument();
  });

  // ---- Specialist activity indicator tests ----

  it('shows specialist-specific loading text when activeSpecialist is set', () => {
    render(
      <ChatArea messages={[]} streamingContent='' isLoading={true} error={null} activeSpecialist='shanty_specialist' />
    );
    expect(screen.getByTestId('chat-area-loading')).toBeInTheDocument();
    expect(screen.getByText('The discovery specialist is working...')).toBeInTheDocument();
  });

  it('shows coordinator thinking when activeSpecialist is null', () => {
    render(<ChatArea messages={[]} streamingContent='' isLoading={true} error={null} activeSpecialist={null} />);
    expect(screen.getByText('The coordinator is thinking...')).toBeInTheDocument();
  });

  it('shows treasure specialist loading text', () => {
    render(
      <ChatArea
        messages={[]}
        streamingContent=''
        isLoading={true}
        error={null}
        activeSpecialist='treasure_specialist'
      />
    );
    expect(screen.getByText('The account planning specialist is working...')).toBeInTheDocument();
  });

  it('shows crew specialist loading text', () => {
    render(
      <ChatArea messages={[]} streamingContent='' isLoading={true} error={null} activeSpecialist='crew_specialist' />
    );
    expect(screen.getByText('The staffing specialist is working...')).toBeInTheDocument();
  });
});
