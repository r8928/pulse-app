import { describe, expect, it } from 'vitest';
import {
  createAuthorisedDomain,
  getAuthorisedDomains,
  listAuthorisedDomains,
  softDeleteAuthorisedDomain,
  ValidationError,
} from '../database.js';
import { useTestDatabase } from '../test/mongo.js';

/**
 * FR-1.5: sign in is restricted to Google accounts on an authorised Workspace
 * domain, which is configuration rather than code (FR-6.4).
 */

const actor = { userId: 'actor-1', name: 'Office Administrator' };

describe('authorised domains', () => {
  useTestDatabase();

  it('stores a domain lowercased', async () => {
    await createAuthorisedDomain({ domain: 'Example.COM' }, actor);
    expect((await listAuthorisedDomains()).items[0].domain).toBe('example.com');
  });

  it('rejects something that is not a domain', async () => {
    await expect(
      createAuthorisedDomain({ domain: 'not a domain' }, actor),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects an email address, which is the likeliest mistake', async () => {
    await expect(
      createAuthorisedDomain({ domain: 'someone@example.com' }, actor),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a bare hostname with no dot in it', async () => {
    await expect(
      createAuthorisedDomain({ domain: 'localhost' }, actor),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a duplicate, naming it', async () => {
    await createAuthorisedDomain({ domain: 'example.com' }, actor);

    await expect(
      createAuthorisedDomain({ domain: 'example.com' }, actor),
    ).rejects.toThrow(/example\.com/);
  });

  it('refuses to remove the last one, which would lock everybody out', async () => {
    // FR-1.5 admits a sign-in only from an authorised domain, so an empty list
    // is not a configuration state — it is a lockout with no way back in.
    const only = await createAuthorisedDomain({ domain: 'example.com' }, actor);

    await expect(
      softDeleteAuthorisedDomain(
        String(only._id),
        { reason: 'Wrong domain' },
        only.version,
        actor,
      ),
    ).rejects.toThrow(/last authorised domain/i);
  });

  it('removes one when another remains, and drops it from the sign-in list', async () => {
    const first = await createAuthorisedDomain(
      { domain: 'old.example' },
      actor,
    );
    await createAuthorisedDomain({ domain: 'new.example' }, actor);

    await softDeleteAuthorisedDomain(
      String(first._id),
      { reason: 'Company changed domain' },
      first.version,
      actor,
    );

    expect(await getAuthorisedDomains()).toEqual(['new.example']);
    expect((await listAuthorisedDomains({ includeDeleted: true })).total).toBe(
      2,
    );
  });

  it('requires a reason on the removal', async () => {
    await createAuthorisedDomain({ domain: 'other.example' }, actor);
    const removable = await createAuthorisedDomain(
      { domain: 'old.example' },
      actor,
    );

    await expect(
      softDeleteAuthorisedDomain(
        String(removable._id),
        { reason: '' },
        removable.version,
        actor,
      ),
    ).rejects.toThrow(ValidationError);
  });
});
