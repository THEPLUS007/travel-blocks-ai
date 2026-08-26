import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixturePlan } from '@travel-blocks/test-fixtures';
import { loadApiConfig } from '../src/config.js';
import { checkDatabase, createPool, PostgresTripRepository } from '../src/repository.js';

const config = loadApiConfig();
const pool = createPool(config.databaseUrl, { max: 2 });
let ownerId = '';
let outsiderId = '';

beforeAll(async () => checkDatabase(pool));
afterAll(async () => {
  if (ownerId || outsiderId) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[ownerId, outsiderId].filter(Boolean)]);
  }
  await pool.end();
});

describe('PostgresTripRepository integration', () => {
  it('persists a complex trip across repository recreation and enforces ownership', async () => {
    const firstRepository = new PostgresTripRepository(pool);
    ownerId = await firstRepository.findOrCreateUser(randomBytes(32).toString('hex'));
    outsiderId = await firstRepository.findOrCreateUser(randomBytes(32).toString('hex'));
    const created = await firstRepository.create(ownerId, fixturePlan);
    const updated = await firstRepository.update(ownerId, created.id, {
      ...fixturePlan,
      trip: { ...fixturePlan.trip, name: 'PostgreSQL integration updated' },
    }, created.version ?? 1);
    expect(updated).not.toBeNull();
    expect(updated).not.toBe('conflict');

    const recreatedRepository = new PostgresTripRepository(pool);
    const persisted = await recreatedRepository.get(ownerId, created.id);
    expect(persisted).toMatchObject({ title: 'PostgreSQL integration updated', version: 2 });
    expect(persisted?.days[0].blocks).toHaveLength(fixturePlan.days[0].blocks.length);
    expect(await recreatedRepository.get(outsiderId, created.id)).toBeNull();
    expect(await recreatedRepository.delete(ownerId, created.id)).toBe(true);
    expect(await recreatedRepository.get(ownerId, created.id)).toBeNull();
  });
});
