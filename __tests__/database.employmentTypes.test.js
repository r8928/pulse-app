import { describe, expect, it } from 'vitest';
import { ROLES } from '../constants/index.js';
import {
  createEmploymentType,
  createUser,
  listEmploymentTypes,
  StaleWriteError,
  softDeleteEmploymentType,
  updateEmploymentType,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-2.6 and FR-6.4: employment types are company-wide configuration, editable
 * at runtime, and no permission depends on any of them.
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('employment types', () => {
  useTestDatabase();

  it('creates one and lists it', async () => {
    await createEmploymentType({ name: 'PERMANENT' }, actor);
    const { items, total } = await listEmploymentTypes();

    expect(total).toBe(1);
    expect(items[0].name).toBe('PERMANENT');
    expect(items[0].version).toBe(1);
    expect(items[0].deletedAt).toBeNull();
  });

  it('rejects a duplicate name with the name stated', async () => {
    await createEmploymentType({ name: 'PERMANENT' }, actor);

    await expect(
      createEmploymentType({ name: 'PERMANENT' }, actor),
    ).rejects.toThrow(/PERMANENT/);
  });

  it('rejects an empty name rather than storing one', async () => {
    await expect(createEmploymentType({ name: '  ' }, actor)).rejects.toThrow(
      ValidationError,
    );
  });

  it('renames one and bumps its version', async () => {
    const created = await createEmploymentType({ name: 'CONTRACT' }, actor);
    const renamed = await updateEmploymentType(
      String(created._id),
      { name: 'FIXED_TERM' },
      created.version,
      actor,
    );

    expect(renamed.name).toBe('FIXED_TERM');
    expect(renamed.version).toBe(2);
  });

  it('rejects a rename against a stale version', async () => {
    const created = await createEmploymentType({ name: 'CONTRACT' }, actor);
    await updateEmploymentType(
      String(created._id),
      { name: 'A' },
      created.version,
      actor,
    );

    await expect(
      updateEmploymentType(
        String(created._id),
        { name: 'B' },
        created.version,
        actor,
      ),
    ).rejects.toThrow(StaleWriteError);
  });

  it('refuses to soft delete one still held by a user who is not soft deleted', async () => {
    // The FR-3.2 rule for teams, applied to the other company-wide list: name
    // the holders so they can be moved first.
    const created = await createEmploymentType({ name: 'INTERN' }, actor);
    await createUser(
      {
        fullName: 'Ivy Tanaka',
        employeeCode: 'INT-001',
        employmentType: 'INTERN',
        tracked: true,
        loginEnabled: true,
        role: ROLES.EMPLOYEE,
        dateOfJoining: '2026-01-05',
      },
      actor,
    );

    await expect(
      softDeleteEmploymentType(
        String(created._id),
        { reason: 'No longer used' },
        created.version,
        actor,
      ),
    ).rejects.toThrow(/Ivy Tanaka/);
  });

  it('soft deletes an unused one and drops it from the default list', async () => {
    const created = await createEmploymentType({ name: 'INTERN' }, actor);
    const deleted = await softDeleteEmploymentType(
      String(created._id),
      { reason: 'No longer used' },
      created.version,
      actor,
    );

    expect(deleted.deletedAt).toBeInstanceOf(Date);
    expect((await listEmploymentTypes()).total).toBe(0);
    expect((await listEmploymentTypes({ includeDeleted: true })).total).toBe(1);
  });

  it('requires a reason on the soft delete', async () => {
    const created = await createEmploymentType({ name: 'INTERN' }, actor);

    await expect(
      softDeleteEmploymentType(
        String(created._id),
        { reason: '  ' },
        created.version,
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });

  it('answers null for an id that does not exist rather than throwing', async () => {
    expect(
      await updateEmploymentType('not-an-id', { name: 'X' }, 1, actor),
    ).toBeNull();
  });
});
