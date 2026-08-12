import { describe, expect, it } from 'vitest';
import { SIGNIN_REJECTION } from '../../constants/index.js';
import { evaluateSignIn } from '../signin.js';

/**
 * FR-1.5 and S-01. Five distinct rejection reasons, never one generic failure:
 * a person turned away has to be able to tell which applies to them.
 *
 * These are pure so every branch is exercisable. The database supplies the
 * user and the authorised domains; the decision itself lives here.
 */

const activeUser = (overrides = {}) => ({
  workEmail: 'ada@pulse.test',
  loginEnabled: true,
  deletedAt: null,
  tenures: [{ startDate: '2026-01-01', endDate: null, deletedAt: null }],
  ...overrides,
});

const evaluate = (overrides = {}) =>
  evaluateSignIn({
    email: 'ada@pulse.test',
    user: activeUser(),
    authorisedDomains: ['pulse.test'],
    onDate: '2026-08-12',
    ...overrides,
  });

describe('evaluateSignIn', () => {
  it('admits an active user inside their employment period', () => {
    expect(evaluate()).toEqual({ allowed: true });
  });

  it('rejects an email on a domain that is not authorised', () => {
    const result = evaluate({ email: 'ada@elsewhere.test' });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.UNAUTHORISED_DOMAIN);
  });

  it('rejects when no user holds that work email', () => {
    const result = evaluate({ user: null });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.NO_MATCHING_USER);
  });

  it('rejects a soft deleted user, who loses access immediately', () => {
    const result = evaluate({
      user: activeUser({ deletedAt: '2026-08-10T09:00:00.000Z' }),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.USER_SOFT_DELETED);
  });

  it('rejects when login is disabled, without touching the work email', () => {
    const result = evaluate({ user: activeUser({ loginEnabled: false }) });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.LOGIN_DISABLED);
  });

  it('rejects a date before the employment period begins', () => {
    const result = evaluate({
      user: activeUser({
        tenures: [{ startDate: '2026-09-01', endDate: null, deletedAt: null }],
      }),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.OUTSIDE_EMPLOYMENT_PERIOD);
  });

  it('rejects a date after a closed tenure ended', () => {
    const result = evaluate({
      user: activeUser({
        tenures: [
          { startDate: '2026-01-01', endDate: '2026-08-03', deletedAt: null },
        ],
      }),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.OUTSIDE_EMPLOYMENT_PERIOD);
  });

  it('rejects a date falling in the gap between two tenures', () => {
    // FR-2.12: a gap between tenures is outside the employment period. The
    // re-hire case of MVP criterion 17 — left 3 August, returns 5 November.
    const result = evaluate({
      onDate: '2026-09-15',
      user: activeUser({
        tenures: [
          { startDate: '2026-01-01', endDate: '2026-08-03', deletedAt: null },
          { startDate: '2026-11-05', endDate: null, deletedAt: null },
        ],
      }),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.OUTSIDE_EMPLOYMENT_PERIOD);
  });

  it('admits a date inside a later tenure, after a gap', () => {
    expect(
      evaluate({
        onDate: '2026-11-20',
        user: activeUser({
          tenures: [
            { startDate: '2026-01-01', endDate: '2026-08-03', deletedAt: null },
            { startDate: '2026-11-05', endDate: null, deletedAt: null },
          ],
        }),
      }),
    ).toEqual({ allowed: true });
  });

  it('ignores a soft deleted tenure when working out the employment period', () => {
    const result = evaluate({
      user: activeUser({
        tenures: [
          {
            startDate: '2026-01-01',
            endDate: null,
            deletedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      }),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.OUTSIDE_EMPLOYMENT_PERIOD);
  });

  it('admits on the first day of a tenure, which is inclusive', () => {
    expect(
      evaluate({
        onDate: '2026-01-01',
        user: activeUser({
          tenures: [
            { startDate: '2026-01-01', endDate: null, deletedAt: null },
          ],
        }),
      }),
    ).toEqual({ allowed: true });
  });

  it('admits on the last day of a tenure, which is inclusive', () => {
    expect(
      evaluate({
        onDate: '2026-08-03',
        user: activeUser({
          tenures: [
            { startDate: '2026-01-01', endDate: '2026-08-03', deletedAt: null },
          ],
        }),
      }),
    ).toEqual({ allowed: true });
  });

  it('reports the domain first, so an unknown email is not confirmed or denied', () => {
    // Answering NO_MATCHING_USER for an outside address would let anyone probe
    // which work emails exist. The domain gate is checked before the lookup.
    const result = evaluate({ email: 'stranger@elsewhere.test', user: null });

    expect(result.reason).toBe(SIGNIN_REJECTION.UNAUTHORISED_DOMAIN);
  });

  it('matches the domain case insensitively, since email case is not meaningful', () => {
    expect(evaluate({ email: 'Ada@Pulse.TEST' })).toEqual({ allowed: true });
  });

  it('rejects a user with no work email, who can never sign in', () => {
    const result = evaluate({
      user: activeUser({ workEmail: null }),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe(SIGNIN_REJECTION.NO_MATCHING_USER);
  });
});
