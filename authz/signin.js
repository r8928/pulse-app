import { SIGNIN_REJECTION } from '../constants/index.js';
import { isWithinEmploymentPeriod } from '../utils/employment.js';

/**
 * The FR-1.5 sign-in decision, as a pure function.
 *
 * The database supplies the candidate user and the authorised domains; the
 * decision itself lives here so every branch is exercisable in a test without
 * a connection, a session, or an OAuth round trip.
 *
 * S-01 requires five distinct rejection reasons rather than one generic
 * failure, because a person turned away has to be able to tell which applies
 * to them — and because "sign in failed" is unactionable for the office
 * administrator trying to help them.
 */

const domainOf = (email) => email.split('@').at(-1)?.toLowerCase() ?? '';

export function evaluateSignIn({ email, user, authorisedDomains, onDate }) {
  // Checked before the user lookup, deliberately. Answering NO_MATCHING_USER
  // to an outside address would let anyone probe which work emails exist.
  const authorised = authorisedDomains.map((domain) => domain.toLowerCase());
  if (!authorised.includes(domainOf(email))) {
    return { allowed: false, reason: SIGNIN_REJECTION.UNAUTHORISED_DOMAIN };
  }

  // FR-1.5: support staff hold no work email and therefore never sign in,
  // though they are still tracked for attendance. Removing a work email
  // removes sign-in while keeping the user and their history.
  if (!user?.workEmail) {
    return { allowed: false, reason: SIGNIN_REJECTION.NO_MATCHING_USER };
  }

  // FR-2.4: a soft deleted user loses access immediately and regains it only
  // on restore. This never waits for the FR-2.11 records approval.
  if (user.deletedAt) {
    return { allowed: false, reason: SIGNIN_REJECTION.USER_SOFT_DELETED };
  }

  if (!user.loginEnabled) {
    return { allowed: false, reason: SIGNIN_REJECTION.LOGIN_DISABLED };
  }

  // FR-2.12: derived from tenures, never stored. A date in the gap between two
  // tenures is outside the period, which is the re-hire case of criterion 17.
  if (!isWithinEmploymentPeriod(user.tenures, onDate)) {
    return {
      allowed: false,
      reason: SIGNIN_REJECTION.OUTSIDE_EMPLOYMENT_PERIOD,
    };
  }

  return { allowed: true };
}
