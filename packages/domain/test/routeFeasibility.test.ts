import { describe, expect, it } from 'vitest';
import type { TravelBlock, TravelPlanDraft } from '@travel-blocks/shared';
import { checkRouteFeasibility, haversineStraightLineKm, isValidRouteCoordinate } from '../src/routeFeasibility.js';
import { validateItinerary } from '../src/itineraryValidation.js';

const block = (id: string, placeId?: string): TravelBlock => ({
  id, title: id, category: 'sightseeing', priceLevel: 'low',
  ...(placeId ? { place: { provider: 'fixture', providerPlaceId: placeId, verified: true } } : {}),
});
const plan = (days: TravelPlanDraft['days']): TravelPlanDraft => ({
  trip: { name: 'Route test', country: 'KR', city: '서울', duration: `${days.length} days`, budget: '', travelers: '', style: '', description: '' },
  days, connections: [],
});
const singleDay = (...blocks: TravelBlock[]) => plan([{ id: 'day-1', dayNumber: 1, title: 'Day 1', blocks }]);

describe('route feasibility', () => {
  it('calculates zero for the same coordinate and a known Seoul-to-Busan range', () => {
    expect(haversineStraightLineKm({ latitude: 37.5665, longitude: 126.978 }, { latitude: 37.5665, longitude: 126.978 })).toBeCloseTo(0, 10);
    const km = haversineStraightLineKm({ latitude: 37.5665, longitude: 126.978 }, { latitude: 35.1796, longitude: 129.0756 });
    expect(km).toBeGreaterThan(320);
    expect(km).toBeLessThan(330);
  });

  it('safely rejects invalid latitude and longitude', () => {
    expect(isValidRouteCoordinate({ latitude: 91, longitude: 0 })).toBe(false);
    expect(isValidRouteCoordinate({ latitude: 0, longitude: 181 })).toBe(false);
    expect(haversineStraightLineKm({ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 })).toBeUndefined();
    expect(haversineStraightLineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 181 })).toBeUndefined();
  });

  it('does not warn for nearby verified places', () => {
    const result = checkRouteFeasibility(singleDay(block('a', 'a'), block('b', 'b')), {
      'fixture:a': { latitude: 37.56, longitude: 126.97 }, 'fixture:b': { latitude: 37.565, longitude: 126.975 },
    }, { maxConsecutiveStraightLineKm: 5, maxDailyStraightLineKm: 5 });
    expect(result.warnings).toEqual([]);
    expect(result.segments).toHaveLength(1);
  });

  it('warns for a far consecutive segment', () => {
    const result = checkRouteFeasibility(singleDay(block('a', 'a'), block('b', 'b')), {
      'fixture:a': { latitude: 37.5665, longitude: 126.978 }, 'fixture:b': { latitude: 35.1796, longitude: 129.0756 },
    }, { maxConsecutiveStraightLineKm: 100 });
    expect(result.warnings).toMatchObject([{ code: 'long_consecutive_distance', severity: 'warning', sourceBlockId: 'a', targetBlockId: 'b' }]);
  });

  it('warns for excessive daily geographic spread', () => {
    const result = checkRouteFeasibility(singleDay(block('a', 'a'), block('b', 'b'), block('c', 'c')), {
      'fixture:a': { latitude: 0, longitude: 0 }, 'fixture:b': { latitude: 0, longitude: 0.5 }, 'fixture:c': { latitude: 0, longitude: 1 },
    }, { maxConsecutiveStraightLineKm: 100, maxDailyStraightLineKm: 100 });
    expect(result.warnings).toMatchObject([{ code: 'excessive_daily_geographic_spread', severity: 'warning', dayId: 'day-1' }]);
    expect(result.dailyMetrics[0].totalStraightLineKm).toBeGreaterThan(100);
  });

  it('skips missing and invalid coordinates without substituting a location', () => {
    const result = checkRouteFeasibility(singleDay(block('a', 'a'), block('b', 'b'), block('c', 'c')), {
      'fixture:a': { latitude: 0, longitude: 0 }, 'fixture:b': { latitude: 0, longitude: 181 },
    });
    expect(result.segments).toEqual([]);
    expect(result.skippedSegments).toHaveLength(2);
    expect(result.coverage).toEqual({ possibleSegments: 2, evaluatedSegments: 0, skippedSegments: 2 });
    expect(result.skippedSegmentCount).toBe(2);
  });

  it('ignores non-place blocks and evaluates each day independently', () => {
    const result = checkRouteFeasibility(plan([
      { id: 'day-1', dayNumber: 1, title: 'Day 1', blocks: [block('a', 'a'), block('text'), block('b', 'b')] },
      { id: 'day-2', dayNumber: 2, title: 'Day 2', blocks: [block('c', 'c'), block('d', 'd')] },
    ]), {
      'fixture:a': { latitude: 0, longitude: 0 }, 'fixture:b': { latitude: 0, longitude: 0.01 },
      'fixture:c': { latitude: 35, longitude: 129 }, 'fixture:d': { latitude: 35, longitude: 129.01 },
    });
    expect(result.segments).toMatchObject([{ dayId: 'day-1', sourceBlockId: 'a', targetBlockId: 'b' }, { dayId: 'day-2', sourceBlockId: 'c', targetBlockId: 'd' }]);
    expect(result.dailyMetrics.map((metric) => metric.evaluatedSegmentCount)).toEqual([1, 1]);
  });

  it('is deterministic and does not make a structurally valid itinerary invalid', () => {
    const value = singleDay(block('a', 'a'), block('b', 'b'));
    const coordinates = { 'fixture:a': { latitude: 37.5665, longitude: 126.978 }, 'fixture:b': { latitude: 35.1796, longitude: 129.0756 } };
    expect(checkRouteFeasibility(value, coordinates, { maxConsecutiveStraightLineKm: 100 })).toEqual(checkRouteFeasibility(value, coordinates, { maxConsecutiveStraightLineKm: 100 }));
    expect(validateItinerary(value, { verifiedCandidateIds: new Set(['fixture:a', 'fixture:b']) }).valid).toBe(true);
  });
});
