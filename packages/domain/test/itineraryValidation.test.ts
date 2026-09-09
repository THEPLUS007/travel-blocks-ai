import { describe, expect, it } from 'vitest';
import type { TravelPlanDraft } from '@travel-blocks/shared';
import { MAX_BLOCKS_PER_DAY, validateItinerary } from '../src/itineraryValidation.js';

const block = (id: string, placeId?: string) => ({
  id, title: id, category: 'sightseeing' as const, priceLevel: 'low' as const,
  ...(placeId ? { place: { provider: 'google', providerPlaceId: placeId, verified: true as const } } : {}),
});
const plan = (): TravelPlanDraft => ({
  trip: { name: 'Trip', country: 'KR', city: 'Seoul', duration: '2 days', budget: '', travelers: '', style: '', description: '' },
  days: [
    { id: 'day-1', dayNumber: 1, title: 'One', blocks: [block('a', 'p1'), block('b')] },
    { id: 'day-2', dayNumber: 2, title: 'Two', blocks: [block('c')] },
  ],
  connections: [{ id: 'c1', dayId: 'day-1', sourceBlockId: 'a', targetBlockId: 'b' }],
});
const codes = (value: TravelPlanDraft, candidates?: ReadonlySet<string>) => validateItinerary(value, { verifiedCandidateIds: candidates }).issues.map((issue) => issue.code);

it('accepts a valid plan and verified candidate', () => expect(validateItinerary(plan(), { verifiedCandidateIds: new Set(['google:p1']) }).valid).toBe(true));
it('rejects duplicate day IDs', () => { const value = plan(); value.days[1].id = 'day-1'; expect(codes(value)).toContain('duplicate_day_id'); });
it('rejects duplicate day numbers', () => { const value = plan(); value.days[1].dayNumber = 1; expect(codes(value)).toContain('duplicate_day_number'); });
it('rejects skipped day numbers', () => { const value = plan(); value.days[1].dayNumber = 3; expect(codes(value)).toContain('non_sequential_day_number'); });
it('rejects duplicate block IDs across days', () => { const value = plan(); value.days[1].blocks[0].id = 'a'; expect(codes(value)).toContain('duplicate_block_id'); });
it('rejects duplicate verified places', () => { const value = plan(); value.days[1].blocks[0] = block('c', 'p1'); expect(codes(value)).toContain('duplicate_verified_place'); });
it('rejects a missing connection source', () => { const value = plan(); value.connections[0].sourceBlockId = 'missing'; expect(codes(value)).toContain('missing_connection_source'); });
it('rejects a missing connection target', () => { const value = plan(); value.connections[0].targetBlockId = 'missing'; expect(codes(value)).toContain('missing_connection_target'); });
it('rejects a cross-day connection', () => { const value = plan(); value.connections[0].targetBlockId = 'c'; expect(codes(value)).toContain('cross_day_connection'); });
it('rejects a self connection', () => { const value = plan(); value.connections[0].targetBlockId = 'a'; expect(codes(value)).toContain('self_connection'); });
it('rejects excessive day density', () => { const value = plan(); value.days[0].blocks = Array.from({ length: MAX_BLOCKS_PER_DAY + 1 }, (_, index) => block(`x${index}`)); expect(codes(value)).toContain('too_many_blocks'); });
it('rejects a fake verified candidate', () => expect(codes(plan(), new Set(['google:other']))).toContain('unknown_verified_place'));

describe('connection references', () => {
  it('rejects a missing day and duplicate connection ID', () => {
    const value = plan();
    value.connections.push({ ...value.connections[0] });
    value.connections[0].dayId = 'missing';
    expect(codes(value)).toEqual(expect.arrayContaining(['missing_connection_day', 'duplicate_connection_id']));
  });
});

it.each([12, 13])('preserves the business limit for %i blocks', (count) => {
  const value = plan();
  value.connections = [];
  value.days[0].blocks = Array.from({ length: count }, (_, index) => block(`limit-${index}`));
  expect(MAX_BLOCKS_PER_DAY).toBe(12);
  expect(validateItinerary(value).valid).toBe(count === 12);
  expect(codes(value)).toEqual(count === 12 ? [] : ['too_many_blocks']);
});
