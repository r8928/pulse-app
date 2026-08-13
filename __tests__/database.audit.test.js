import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createUser,
  getRecordHistory,
  listAuditActions,
  listAuditRecords,
  writeAuditRecord,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * S-22. FR-9.1 to FR-9.3: every change ever made, append only and retained
 * indefinitely, read only without exception.
 *
 * There is deliberately no update or soft-delete function for this collection
 * anywhere in `database.js`, which is what makes FR-9.3 true rather than a
 * convention — no application endpoint can offer an edit that no code path
 * exists for.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

const record = (overrides = {}) =>
  writeAuditRecord({
    actorId: 'actor-1',
    actorName: 'Office Administrator',
    action: 'USER_UPDATED',
    entityType: 'user',
    entityId: 'u1',
    ...overrides,
  });

describe('listAuditRecords', () => {
  useTestDatabase();

  it('returns the newest first', async () => {
    await record({ action: 'FIRST' });
    await record({ action: 'SECOND' });

    const { items } = await listAuditRecords();
    expect(items[0].action).toBe('SECOND');
  });

  it('pages, because the log grows without limit', async () => {
    // NFR-3 and DC-10: never materialised whole.
    for (let index = 0; index < 5; index += 1) {
      await record({ entityId: `u${index}` });
    }

    const first = await listAuditRecords({ page: 1, pageSize: 2 });
    const second = await listAuditRecords({ page: 2, pageSize: 2 });

    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(2);
    expect(first.total).toBe(5);
    // No row may appear on two pages: the sort has to break its own ties.
    const ids = [...first.items, ...second.items].map((item) =>
      String(item._id),
    );
    expect(new Set(ids).size).toBe(4);
  });

  it('filters by actor, action and entity type', async () => {
    await record({ action: 'USER_CREATED', actorId: 'a1', actorName: 'Ann' });
    await record({
      action: 'TEAM_CREATED',
      entityType: 'team',
      actorId: 'a2',
      actorName: 'Bo',
    });

    expect((await listAuditRecords({ action: 'TEAM_CREATED' })).total).toBe(1);
    expect((await listAuditRecords({ actorId: 'a1' })).total).toBe(1);
    expect((await listAuditRecords({ entityType: 'team' })).total).toBe(1);
  });

  it('filters by a date range on the instant it happened', async () => {
    await record();

    const today = new Date().toISOString().slice(0, 10);
    expect((await listAuditRecords({ from: today, to: today })).total).toBe(1);
    expect(
      (await listAuditRecords({ from: '2000-01-01', to: '2000-01-02' })).total,
    ).toBe(0);
  });

  it('carries the before and after documents, not a diff', async () => {
    // FR-9.2 and ARCHITECTURE 4.1: P-44 shows them side by side, and a diff
    // computed at write time cannot answer a question nobody had asked yet.
    await record({ before: { role: 'EMPLOYEE' }, after: { role: 'IT' } });

    const { items } = await listAuditRecords();
    expect(items[0].before).toEqual({ role: 'EMPLOYEE' });
    expect(items[0].after).toEqual({ role: 'IT' });
  });

  it('records a real mutation without being asked to', async () => {
    // FR-9.1: every create writes one, so the log is never empty in practice.
    await createUser(
      {
        fullName: 'Alice Adeyemi',
        employeeCode: 'EMP-001',
        employmentType: 'PERMANENT',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-05',
      },
      actor,
    );

    const { items } = await listAuditRecords({ action: 'USER_CREATED' });
    expect(items[0].entityType).toBe('user');
  });
});

describe('listAuditActions', () => {
  useTestDatabase();

  it('offers the actions and entity types actually present, for the filters', async () => {
    await record({ action: 'USER_CREATED' });
    await record({ action: 'TEAM_CREATED', entityType: 'team' });

    const { actions, entityTypes } = await listAuditActions();
    expect(actions).toEqual(['TEAM_CREATED', 'USER_CREATED']);
    expect(entityTypes).toEqual(['team', 'user']);
  });
});

describe('getRecordHistory', () => {
  useTestDatabase();

  it('returns one record’s whole history, newest first', async () => {
    // FR-9.4, which P-45 renders as a drawer.
    await record({ action: 'FIRST', entityId: 'u1' });
    await record({ action: 'SECOND', entityId: 'u1' });
    await record({ action: 'OTHER', entityId: 'u2' });

    const history = await getRecordHistory('user', 'u1');
    expect(history).toHaveLength(2);
    expect(history[0].action).toBe('SECOND');
  });
});
