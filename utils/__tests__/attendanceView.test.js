import { describe, expect, it } from 'vitest';
import { SCOPES } from '../../constants/index.js';
import { attendanceViewFrom } from '../attendanceView.js';

/**
 * What the attendance summary opens on, and what the URL may change it to.
 *
 * The scope a viewer's `attendance.read` is granted at decides which rows they
 * may see at all (`rosterScope.js`). This is the separate question of which of
 * those rows they are shown FIRST — an administrator arrives to read about
 * everybody, a colleague arrives to read about themselves, and either can say
 * otherwise. `FR-8.1` is untouched: nothing here narrows what may be reached.
 */

const viewerId = 'u1';

describe('attendanceViewFrom', () => {
  it('opens a non-admin on their own row', () => {
    const view = attendanceViewFrom({}, { admin: false, viewerId });

    expect(view.view).toBe(SCOPES.SELF);
    expect(view.requested.userId).toBe(viewerId);
  });

  it('opens an admin on everyone', () => {
    const view = attendanceViewFrom({}, { admin: true, viewerId });

    expect(view.view).toBe(SCOPES.ALL);
    expect(view.requested.userId).toBe(null);
  });

  it('lets a non-admin widen to everyone, since FR-8.1 still reaches there', () => {
    const view = attendanceViewFrom(
      { view: SCOPES.ALL },
      { admin: false, viewerId },
    );

    expect(view.view).toBe(SCOPES.ALL);
    expect(view.requested.userId).toBe(null);
  });

  it('lets an admin narrow to themselves', () => {
    const view = attendanceViewFrom(
      { view: SCOPES.SELF },
      { admin: true, viewerId },
    );

    expect(view.view).toBe(SCOPES.SELF);
    expect(view.requested.userId).toBe(viewerId);
  });

  it('pins the viewer to themselves under SELF, whatever the URL asks for', () => {
    // The toggle and the colleague picker cannot contradict each other. Under
    // SELF the picker is not on screen, so a userId left in the URL is stale.
    const view = attendanceViewFrom(
      { view: SCOPES.SELF, userId: 'u9', teamId: 't9' },
      { admin: true, viewerId },
    );

    expect(view.requested).toEqual({ teamId: null, userId: viewerId });
  });

  it('carries the team and colleague filters through under ALL', () => {
    const view = attendanceViewFrom(
      { view: SCOPES.ALL, userId: 'u9', teamId: 't9' },
      { admin: true, viewerId },
    );

    expect(view.requested).toEqual({ teamId: 't9', userId: 'u9' });
  });

  it('falls back to the default for a view the URL invents', () => {
    // DC-6: an unreadable value is never quietly treated as the widest one.
    expect(
      attendanceViewFrom({ view: 'EVERYBODY' }, { admin: false, viewerId })
        .view,
    ).toBe(SCOPES.SELF);

    expect(
      attendanceViewFrom({ view: SCOPES.TEAM }, { admin: false, viewerId })
        .view,
    ).toBe(SCOPES.SELF);
  });

  it('leaves a viewer with no id on their own view rather than everyone', () => {
    const view = attendanceViewFrom({}, { admin: false, viewerId: null });

    expect(view.view).toBe(SCOPES.SELF);
    // REACHES_NOBODY territory: rosterScope.js decides what an absent viewer
    // reaches. What matters here is that it is not silently widened to ALL.
    expect(view.requested.userId).toBe(null);
  });
});

describe('attendanceViewFrom — colleagues who have left', () => {
  it('excludes them by default', () => {
    expect(attendanceViewFrom({}, { admin: true, viewerId }).includeLeft).toBe(
      false,
    );
  });

  it('includes them when an admin asks', () => {
    expect(
      attendanceViewFrom({ includeLeft: 'true' }, { admin: true, viewerId })
        .includeLeft,
    ).toBe(true);
  });

  it('refuses a non-admin who asks through the URL', () => {
    // The control is not on screen for them, so this can only be a typed URL.
    expect(
      attendanceViewFrom({ includeLeft: 'true' }, { admin: false, viewerId })
        .includeLeft,
    ).toBe(false);
  });
});
