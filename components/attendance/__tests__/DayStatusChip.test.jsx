import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DAY_STATUS } from '../../../constants/index.js';
import { DayStatusChip } from '../DayStatusChip.jsx';

/**
 * FR-5.2 and NFR-12. Status is never conveyed by colour alone: every chip
 * carries a written label, and the variant it selects is a theme concern
 * rather than an sx map (CLAUDE.md).
 */

describe('DayStatusChip', () => {
  it('names every status in words', () => {
    const labels = {
      [DAY_STATUS.WFO]: /in office/i,
      [DAY_STATUS.WFH]: /from home/i,
      [DAY_STATUS.LEAVE]: /leave/i,
      [DAY_STATUS.HOLIDAY_WORK]: /worked a non-working day/i,
      [DAY_STATUS.WEEKLY_OFF]: /weekly off/i,
      [DAY_STATUS.HOLIDAY]: /holiday/i,
      [DAY_STATUS.ABSENT]: /absent/i,
    };

    for (const [status, label] of Object.entries(labels)) {
      const { unmount } = render(<DayStatusChip status={status} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it("marks a status an administrator set, so it is not read as the engine's", () => {
    render(<DayStatusChip status={DAY_STATUS.WFH} overridden />);

    expect(screen.getByText(/set by an administrator/i)).toBeInTheDocument();
  });

  it('does not claim an override when there is none', () => {
    render(<DayStatusChip status={DAY_STATUS.WFO} />);

    expect(
      screen.queryByText(/set by an administrator/i),
    ).not.toBeInTheDocument();
  });

  it('says a status is not yet known rather than rendering nothing', () => {
    // FR-3.12: a day whose shift is unknown has no status, and an empty cell
    // is indistinguishable from a failure to load.
    render(<DayStatusChip status={null} />);

    expect(screen.getByText(/not known/i)).toBeInTheDocument();
  });
});
