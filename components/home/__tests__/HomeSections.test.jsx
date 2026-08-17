import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EXCEPTION_QUEUE } from '../../../constants/index.js';
import { ExceptionCounts } from '../ExceptionCounts.jsx';
import { OwnSnapshot } from '../OwnSnapshot.jsx';

/**
 * `S-04`'s two completed sections.
 *
 * The empty state is the interesting one and the spec is explicit about it: a
 * new user with no records sees an explanatory line, **not zeroed statistics**
 * — because "0 present days" reads as "you were absent all year" rather than
 * as "we have nothing about you yet".
 */

const attendance = {
  present: 210,
  absent: 3,
  wfh: 12,
  leave: 8,
  lateDays: 5,
  holidayWork: 2,
};

const balances = [
  { leaveType: 'Annual', balance: 6.5 },
  { leaveType: 'Casual', balance: 2 },
  { leaveType: 'PTO', balance: 1.5 },
];

describe('OwnSnapshot', () => {
  it('shows the viewer their own year without making them go and find it', () => {
    render(
      <OwnSnapshot attendance={attendance} balances={balances} hasRecords />,
    );

    expect(screen.getByText('210')).toBeInTheDocument();
    expect(screen.getByText(/present/i)).toBeInTheDocument();
  });

  it('gives each balance its own figure, PTO among them (FR-6.2, §21)', () => {
    render(
      <OwnSnapshot attendance={attendance} balances={balances} hasRecords />,
    );

    expect(screen.getByText('Annual')).toBeInTheDocument();
    expect(screen.getByText('6.5')).toBeInTheDocument();
    expect(screen.getByText('PTO')).toBeInTheDocument();
  });

  it('explains itself rather than showing zeroes to someone with no records', () => {
    render(
      <OwnSnapshot
        attendance={{ present: 0, absent: 0, wfh: 0, leave: 0, lateDays: 0 }}
        balances={[]}
        hasRecords={false}
      />,
    );

    expect(
      screen.getByText(/nothing recorded for you yet/i),
    ).toBeInTheDocument();
    // The point of the whole test: no "0" masquerading as a fact.
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });
});

describe('ExceptionCounts', () => {
  const counts = Object.fromEntries(
    Object.values(EXCEPTION_QUEUE).map((queue) => [queue, 0]),
  );

  it('shows only the queues that actually have something waiting', () => {
    render(
      <ExceptionCounts
        counts={{
          ...counts,
          [EXCEPTION_QUEUE.MISSING_PUNCH]: 4,
          [EXCEPTION_QUEUE.PTO_PENDING]: 2,
        }}
      />,
    );

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    // An empty queue is not news, and twelve zero tiles would bury the two
    // that matter.
    expect(screen.queryByText(/duplicate punch/i)).not.toBeInTheDocument();
  });

  it('links each count into its own tab on S-05', () => {
    render(
      <ExceptionCounts
        counts={{ ...counts, [EXCEPTION_QUEUE.MISSING_PUNCH]: 4 }}
      />,
    );

    expect(
      screen.getByRole('link', { name: /missing check in or check out/i }),
    ).toHaveAttribute(
      'href',
      expect.stringContaining(`queue=${EXCEPTION_QUEUE.MISSING_PUNCH}`),
    );
  });

  it('says everything is clear rather than rendering nothing at all', () => {
    render(<ExceptionCounts counts={counts} />);

    expect(screen.getByText(/nothing outstanding/i)).toBeInTheDocument();
  });
});
