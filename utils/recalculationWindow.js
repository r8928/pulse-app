import { addDays, format, subDays } from 'date-fns';

/**
 * The calendar range a set of punch instants can possibly affect.
 *
 * §23.4: editing a punch changes TWO days — the one it left and the one it
 * joined — and §13 lets a crossing shift place either of them a day either
 * side of the instant's own date. Both routes that move a punch bound their
 * recalculation with this, so neither can drift from the other (`CLAUDE.md`).
 *
 * @param {Date[]} instants
 * @returns {{ from: string, to: string }}
 */
export function recalculationWindowFor(instants) {
  const sorted = [...instants].sort((a, b) => a - b);

  return {
    from: format(subDays(sorted[0], 1), 'yyyy-MM-dd'),
    to: format(addDays(sorted.at(-1), 1), 'yyyy-MM-dd'),
  };
}
