import { describe, expect, it } from 'vitest';
import { SCOPES } from '../../constants/index.js';
import { rosterFiltersFor } from '../rosterScope.js';

/**
 * The scope a viewer holds, turned into the filter a roster query takes.
 *
 * The merged summary is one screen for everybody — `FR-1.2` puts the
 * difference between a colleague reading about themselves and an administrator
 * reading about everyone in the SCOPE, not in a second screen. That only holds
 * if the scope reaches the query, which is what this does.
 */

const viewer = { userId: 'u1', teamId: 't1' };

describe('rosterFiltersFor', () => {
  it('narrows a SELF scope to the viewer, whatever the URL asks for', () => {
    const filters = rosterFiltersFor(SCOPES.SELF, viewer, {
      teamId: 't9',
      userId: 'u9',
    });

    // A hand-edited URL must not widen a scope. This is the record half of
    // FR-1.2 applied to a list rather than to one record.
    expect(filters).toEqual({
      teamId: null,
      userId: 'u1',
      canFilterPeople: false,
    });
  });

  it('pins a TEAM scope to the viewer’s own team', () => {
    const filters = rosterFiltersFor(SCOPES.TEAM, viewer, { teamId: 't9' });

    expect(filters.teamId).toBe('t1');
    expect(filters.userId).toBe(null);
  });

  it('lets a TEAM scope narrow to one colleague inside that team', () => {
    const filters = rosterFiltersFor(SCOPES.TEAM, viewer, { userId: 'u4' });

    expect(filters.teamId).toBe('t1');
    expect(filters.userId).toBe('u4');
  });

  it('lets an ALL scope filter freely', () => {
    const filters = rosterFiltersFor(SCOPES.ALL, viewer, {
      teamId: 't9',
      userId: 'u9',
    });

    expect(filters).toEqual({
      teamId: 't9',
      userId: 'u9',
      canFilterPeople: true,
    });
  });

  it('asks for nothing at all when the viewer holds no scope', () => {
    // Failing closed: an absent scope must not read as an unfiltered query.
    expect(rosterFiltersFor(null, viewer, {})).toEqual({
      teamId: null,
      userId: '__none__',
      canFilterPeople: false,
    });
  });

  it('treats an unknown scope as holding nothing', () => {
    expect(rosterFiltersFor('EVERYTHING', viewer, {}).userId).toBe('__none__');
  });

  it('reaches nobody when a TEAM-scoped viewer belongs to no team', () => {
    expect(
      rosterFiltersFor(SCOPES.TEAM, { userId: 'u1', teamId: null }, {}).userId,
    ).toBe('__none__');
  });
});
