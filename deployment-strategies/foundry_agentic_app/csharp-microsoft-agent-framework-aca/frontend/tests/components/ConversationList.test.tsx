import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { ConversationList } from '../../src/components/ConversationList.tsx';
import type { Adventure } from '../../src/types.ts';

// Fixed "now" for relativeTime: 2026-01-03T12:00:00Z
const FIXED_NOW = new Date('2026-01-03T12:00:00Z').getTime();

const ADVENTURES: Adventure[] = [
  {
    id: 'adv-001',
    mode: 'shanty',
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
    lastParleyAt: '2026-01-03T11:58:00Z', // 2 min ago
    messageCount: 5
  },
  {
    id: 'adv-002',
    mode: 'treasure',
    status: 'resolved',
    outcome: {
      tool: 'resolve_treasure',
      result: { found: true, treasure_name: 'Golden Chalice', location: 'Skeleton Cove' }
    },
    createdAt: '2026-01-01T00:00:00Z',
    lastParleyAt: '2026-01-02T12:00:00Z', // 24h ago = 1d ago
    messageCount: 8
  },
  {
    id: 'adv-003',
    mode: 'crew',
    status: 'active',
    createdAt: '2026-01-02T00:00:00Z',
    lastParleyAt: '2026-01-03T09:00:00Z', // 3h ago
    messageCount: 2
  }
];

describe('ConversationList', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders adventure items with relative timestamps', () => {
    render(<ConversationList conversations={ADVENTURES} selectedId={null} onSelect={vi.fn()} isLoading={false} />);
    expect(screen.getByTestId('conversation-item-adv-001')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-item-adv-002')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-item-adv-003')).toBeInTheDocument();
    expect(screen.getByText('2 min ago')).toBeInTheDocument();
    expect(screen.getByText('1d ago')).toBeInTheDocument();
    expect(screen.getByText('3h ago')).toBeInTheDocument();

    // Mode badges
    expect(screen.getByTestId('mode-badge-adv-001')).toHaveTextContent('Discovery');
    expect(screen.getByTestId('mode-badge-adv-002')).toHaveTextContent('Account Plan');
    expect(screen.getByTestId('mode-badge-adv-003')).toHaveTextContent('Staffing');
  });

  it('shows resolved status badge for resolved adventures', () => {
    render(<ConversationList conversations={ADVENTURES} selectedId={null} onSelect={vi.fn()} isLoading={false} />);
    // adv-002 is resolved, should have a status badge
    expect(screen.getByTestId('status-badge-adv-002')).toHaveTextContent('Resolved');
    // adv-001 and adv-003 are active, should not have status badges
    expect(screen.queryByTestId('status-badge-adv-001')).not.toBeInTheDocument();
    expect(screen.queryByTestId('status-badge-adv-003')).not.toBeInTheDocument();
  });

  it('highlights selected conversation', () => {
    render(<ConversationList conversations={ADVENTURES} selectedId='adv-001' onSelect={vi.fn()} isLoading={false} />);
    const item = screen.getByTestId('conversation-item-adv-001');
    expect(item.className).toContain('border-l-indigo-500');
  });

  it('calls onSelect when conversation clicked', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ConversationList conversations={ADVENTURES} selectedId={null} onSelect={onSelect} isLoading={false} />);

    const item = screen.getByTestId('conversation-item-adv-002');
    const btn = item.querySelector('button') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    await user.click(btn);
    expect(onSelect).toHaveBeenCalledWith('adv-002');
  });

  it('shows loading state when loading with no conversations', () => {
    render(<ConversationList conversations={[]} selectedId={null} onSelect={vi.fn()} isLoading={true} />);
    expect(screen.getByTestId('conversation-list-loading')).toBeInTheDocument();
  });

  it('applies mode-specific color classes to badges', () => {
    render(<ConversationList conversations={ADVENTURES} selectedId={null} onSelect={vi.fn()} isLoading={false} />);
    const shantyBadge = screen.getByTestId('mode-badge-adv-001');
    const treasureBadge = screen.getByTestId('mode-badge-adv-002');
    const crewBadge = screen.getByTestId('mode-badge-adv-003');

    expect(shantyBadge.className).toContain('text-amber-400');
    expect(treasureBadge.className).toContain('text-emerald-400');
    expect(crewBadge.className).toContain('text-sky-400');
  });
});
