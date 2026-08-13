import { MongoMemoryServer } from 'mongodb-memory-server';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { ensureIndexes, getDb } from '../database.js';

/**
 * A real MongoDB engine per test file (design record D-6).
 *
 * This deviates from CLAUDE.md's "mock databases" deliberately. The value of a
 * query function is the query: against a mock, a wrong filter, a missing
 * `deletedAt: null`, a broken unique index and a failed version check all pass
 * green, because the assertion only proves the driver was called.
 *
 * `database.js` caches its client on `globalThis`, so the connection string
 * must be in the environment before the first `getDb()` — which happens inside
 * a test, after `beforeAll`, because every query function is lazy.
 */
export function useTestDatabase() {
  let server;

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    process.env.MONGODB_URI = server.getUri();
    process.env.MONGODB_DB = 'pulse-test';
    await ensureIndexes();
  }, 120000);

  afterEach(async () => {
    const db = await getDb();
    const collections = await db.collections();
    // Empties documents but keeps indexes, so every test still runs against
    // the real unique constraints.
    await Promise.all(
      collections.map((collection) => collection.deleteMany({})),
    );
  });

  afterAll(async () => {
    const client = await globalThis.__pulseMongoClient;
    await client?.close();
    globalThis.__pulseMongoClient = undefined;
    await server?.stop();
  });
}
