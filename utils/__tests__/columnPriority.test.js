import { describe, expect, it } from 'vitest';
import { COLUMN_BREAKPOINTS, hideBelow } from '../columnPriority.js';

/**
 * `DESIGN.md` § Layout: a table that cannot fit declares which columns leave
 * first, so the identifying column survives to the narrowest width. A
 * horizontal scrollbar on a data table is a last resort and a silently clipped
 * row is a defect.
 */

describe('hideBelow', () => {
  it('hides a column until the named breakpoint is reached', () => {
    expect(hideBelow('md')).toEqual({
      display: { xs: 'none', md: 'table-cell' },
    });
  });

  it('supports every breakpoint a column may be dropped at', () => {
    for (const breakpoint of COLUMN_BREAKPOINTS) {
      expect(hideBelow(breakpoint).display[breakpoint]).toBe('table-cell');
    }
  });

  it('refuses a breakpoint that is not one of MUI’s, rather than emitting dead CSS', () => {
    // A typo here produces a rule that silently never matches, so the column
    // vanishes at every width. Failing loudly is the only way that is caught.
    expect(() => hideBelow('medium')).toThrow(/medium/);
  });

  it('refuses xs, since hiding a column at every width is not a priority', () => {
    expect(() => hideBelow('xs')).toThrow(/xs/);
  });
});
