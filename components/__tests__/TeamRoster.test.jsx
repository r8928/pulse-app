import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TeamRoster } from '../TeamRoster.jsx';

/**
 * S-16. Every team with its manager and member count. A soft-deleted team
 * stays readable but is no longer offered for assignment (FR-3.2).
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const teams = [
  {
    _id: 't1',
    name: 'GC',
    managerName: 'Marcus Adeyemi',
    defaultShiftName: 'GC night',
    memberCount: 4,
    deletedAt: null,
    version: 1,
  },
];

const unconfigured = [
  {
    _id: 't2',
    name: 'General',
    managerName: null,
    defaultShiftName: null,
    memberCount: 0,
    deletedAt: null,
    version: 1,
  },
];

describe('TeamRoster', () => {
  it('shows each team with its manager, default shift and member count', () => {
    render(<TeamRoster teams={teams} canWrite users={[]} />);

    expect(screen.getByText('GC')).toBeInTheDocument();
    expect(screen.getByText('Marcus Adeyemi')).toBeInTheDocument();
    expect(screen.getByText('GC night')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('says a manager is not set rather than leaving the cell blank', () => {
    // An empty cell is indistinguishable from a failure to load, and FR-3.13
    // wants the gap named rather than hidden.
    render(<TeamRoster teams={unconfigured} canWrite users={[]} />);

    expect(screen.getAllByText(/not set/i).length).toBeGreaterThan(0);
  });

  it('marks a soft-deleted team as no longer offered for assignment', () => {
    render(
      <TeamRoster
        teams={[{ ...teams[0], deletedAt: '2026-01-01T00:00:00.000Z' }]}
        canWrite
        users={[]}
      />,
    );

    expect(screen.getByText(/no longer offered/i)).toBeInTheDocument();
  });

  it('hides every write control from a viewer without team.write', () => {
    render(<TeamRoster teams={teams} canWrite={false} users={[]} />);

    expect(screen.queryByRole('button', { name: /new team/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /edit GC/i })).toBeNull();
  });

  it('offers the write controls to a viewer who holds team.write', () => {
    render(<TeamRoster teams={teams} canWrite users={[]} />);

    expect(screen.getByRole('button', { name: /new team/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /edit GC/i })).toBeEnabled();
  });

  it('points at team creation when there are none yet', () => {
    render(<TeamRoster teams={[]} canWrite users={[]} />);

    expect(screen.getByText(/No team yet/i)).toBeInTheDocument();
  });
});
