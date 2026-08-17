import { LEDGER_ENTRY_TYPE } from '../constants/index.js';
import {
  getTeamPolicy,
  getUserById,
  listTenures,
  postLedgerEntries,
} from '../database.js';
import { prorate } from './accrual.js';

/**
 * §20.1 and design record D-12. Ensures a user's entitlement for one leave
 * year is credited, once, for every leave type their team configures.
 *
 * **There is no cron or queue in this app** — `D-2` rejected one for
 * recalculation on the same reasoning — so a returning employee's next leave
 * year is not credited by a scheduled job. Instead this runs before
 * `recalculateDays` iterates, and again from the balance-read path, so a
 * year's entitlements credit themselves the first time anything looks at a
 * date inside it, whichever comes first.
 *
 * That makes idempotency the whole point: the guard runs constantly, and the
 * second call must post nothing. The `effectKey` identifies the effect as this
 * tenure's credit of this type for this year, and the unique index refuses a
 * repeat (`I-9`, §19.3).
 *
 * It lives in `engine/` rather than in `database.js` because it orchestrates —
 * it reads through the data layer, computes with `accrual.js`, and writes back
 * — which is the same shape as `recalculate.js`. `database.js` never imports
 * from here (§1's layer map).
 */
export async function ensureEntitlementCredited(userId, leaveYear, actor) {
  const user = await getUserById(userId);
  if (!user?.teamId) return { credited: 0 };

  const policy = await getTeamPolicy(user.teamId);
  const leaveTypes = policy?.leaveTypes ?? [];

  // DC-6: a team that has configured no leave types is prompted for them
  // rather than given a guessed entitlement.
  if (leaveTypes.length === 0) return { credited: 0 };

  const tenures = await listTenures(userId);

  /**
   * The tenure covering this leave year is the one the entitlement accrues
   * from. §20.2: a second or later tenure prorates from THAT tenure's start,
   * not the original joining date, so a re-hire accrues from their return.
   * A user with no tenure inside the year is credited nothing rather than
   * prorated from a date they were not employed on.
   */
  const covering = tenures.find(
    (tenure) =>
      tenure.startDate <= leaveYear.end &&
      (!tenure.endDate || tenure.endDate >= leaveYear.start),
  );

  if (!covering) return { credited: 0 };

  let credited = 0;

  for (const type of leaveTypes) {
    const amount = prorate(
      type.annualEntitlement,
      covering.startDate,
      leaveYear,
    );

    // FR-6.9: paternity and maternity seed at zero and post to their own
    // typed balance. Crediting them nothing is the point, not an omission.
    if (amount === 0) continue;

    const posted = await postLedgerEntries(
      [
        {
          entryType: LEDGER_ENTRY_TYPE.ENTITLEMENT_CREDIT,
          leaveType: type.name,
          amount,
          rule: 'BR-12',
        },
      ],
      {
        /**
         * The effect is "this tenure's credit for this leave year", so the key
         * carries both. The leave year stands in for a source version because
         * nothing about the tenure changes when the year rolls over — a new
         * year is a genuinely new effect, and the same tenure legitimately
         * credits again.
         */
        sourceType: 'tenure',
        sourceId: String(covering._id),
        sourceVersion: leaveYear.start,
        userId,
        date: leaveYear.start,
        actor,
        reason: `Annual entitlement for ${leaveYear.start.slice(0, 4)}`,
      },
    );

    credited += posted.length;
  }

  return { credited };
}
