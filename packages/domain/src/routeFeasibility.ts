import type { TravelPlanDraft } from '@travel-blocks/shared';

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export type RouteCoordinateLookup = Readonly<Record<string, RouteCoordinate>> | ReadonlyMap<string, RouteCoordinate>;
export type RouteFeasibilityWarningCode = 'long_consecutive_distance' | 'excessive_daily_geographic_spread';
export type RouteFeasibilitySkippedReason = 'source_coordinates_unavailable' | 'target_coordinates_unavailable';

export interface RouteFeasibilityOptions {
  maxConsecutiveStraightLineKm?: number;
  maxDailyStraightLineKm?: number;
}

export interface RouteFeasibilitySegment {
  dayId: string;
  dayNumber: number;
  sourceBlockId: string;
  targetBlockId: string;
  sourcePlaceId: string;
  targetPlaceId: string;
  straightLineKm: number;
}

export interface RouteFeasibilitySkippedSegment {
  dayId: string;
  dayNumber: number;
  sourceBlockId: string;
  targetBlockId: string;
  sourcePlaceId: string;
  targetPlaceId: string;
  reason: RouteFeasibilitySkippedReason;
}

export interface RouteDailyMetric {
  dayId: string;
  dayNumber: number;
  consecutiveSegmentCount: number;
  evaluatedSegmentCount: number;
  skippedSegmentCount: number;
  maxConsecutiveStraightLineKm: number;
  totalStraightLineKm: number;
}

export interface RouteFeasibilityWarning {
  code: RouteFeasibilityWarningCode;
  severity: 'warning';
  dayId: string;
  dayNumber: number;
  sourceBlockId?: string;
  targetBlockId?: string;
  straightLineKm?: number;
}

export interface RouteFeasibilityResult {
  segments: RouteFeasibilitySegment[];
  skippedSegments: RouteFeasibilitySkippedSegment[];
  dailyMetrics: RouteDailyMetric[];
  warnings: RouteFeasibilityWarning[];
  evaluatedSegmentCount: number;
  skippedSegmentCount: number;
  coverage: {
    possibleSegments: number;
    evaluatedSegments: number;
    skippedSegments: number;
  };
}

const EARTH_RADIUS_KM = 6371.0088;

export function isValidRouteCoordinate(value: RouteCoordinate | undefined): value is RouteCoordinate {
  if (!value) return false;
  return Number.isFinite(value.latitude)
    && Number.isFinite(value.longitude)
    && value.latitude >= -90
    && value.latitude <= 90
    && value.longitude >= -180
    && value.longitude <= 180;
}

/** Great-circle distance in kilometres, not driving or transit route distance. */
export function haversineStraightLineKm(source: RouteCoordinate, target: RouteCoordinate): number | undefined {
  if (!isValidRouteCoordinate(source) || !isValidRouteCoordinate(target)) return undefined;
  const radians = Math.PI / 180;
  const latitudeDelta = (target.latitude - source.latitude) * radians;
  const longitudeDelta = (target.longitude - source.longitude) * radians;
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(source.latitude * radians) * Math.cos(target.latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Checks the ordered verified-place sequence in each day. The result is a
 * geographic heuristic only: it has no routing, duration, traffic, or cost data.
 */
export function checkRouteFeasibility(
  plan: TravelPlanDraft,
  coordinates: RouteCoordinateLookup,
  options: RouteFeasibilityOptions = {},
): RouteFeasibilityResult {
  const segments: RouteFeasibilitySegment[] = [];
  const skippedSegments: RouteFeasibilitySkippedSegment[] = [];
  const dailyMetrics: RouteDailyMetric[] = [];
  const warnings: RouteFeasibilityWarning[] = [];

  for (const day of plan.days) {
    const places = day.blocks.flatMap((block) => {
      const placeId = block.place ? canonicalPlaceId(block.place.provider, block.place.providerPlaceId) : undefined;
      return placeId ? [{ blockId: block.id, placeId }] : [];
    });
    const daySegments: RouteFeasibilitySegment[] = [];
    let daySkipped = 0;

    for (let index = 1; index < places.length; index += 1) {
      const source = places[index - 1];
      const target = places[index];
      const sourceCoordinate = lookupCoordinate(coordinates, source.placeId);
      const targetCoordinate = lookupCoordinate(coordinates, target.placeId);
      const straightLineKm = sourceCoordinate && targetCoordinate
        ? haversineStraightLineKm(sourceCoordinate, targetCoordinate)
        : undefined;

      if (straightLineKm === undefined) {
        const reason: RouteFeasibilitySkippedReason = !isValidRouteCoordinate(sourceCoordinate)
          ? 'source_coordinates_unavailable'
          : 'target_coordinates_unavailable';
        skippedSegments.push({
          dayId: day.id, dayNumber: day.dayNumber,
          sourceBlockId: source.blockId, targetBlockId: target.blockId,
          sourcePlaceId: source.placeId, targetPlaceId: target.placeId, reason,
        });
        daySkipped += 1;
        continue;
      }

      const segment = {
        dayId: day.id, dayNumber: day.dayNumber,
        sourceBlockId: source.blockId, targetBlockId: target.blockId,
        sourcePlaceId: source.placeId, targetPlaceId: target.placeId, straightLineKm,
      };
      segments.push(segment);
      daySegments.push(segment);
      if (isUsableThreshold(options.maxConsecutiveStraightLineKm) && straightLineKm > options.maxConsecutiveStraightLineKm) {
        warnings.push({
          code: 'long_consecutive_distance', severity: 'warning',
          dayId: day.id, dayNumber: day.dayNumber,
          sourceBlockId: source.blockId, targetBlockId: target.blockId, straightLineKm,
        });
      }
    }

    const totalStraightLineKm = daySegments.reduce((total, segment) => total + segment.straightLineKm, 0);
    const maxConsecutiveStraightLineKm = daySegments.reduce((maximum, segment) => Math.max(maximum, segment.straightLineKm), 0);
    dailyMetrics.push({
      dayId: day.id, dayNumber: day.dayNumber,
      consecutiveSegmentCount: Math.max(places.length - 1, 0),
      evaluatedSegmentCount: daySegments.length,
      skippedSegmentCount: daySkipped,
      maxConsecutiveStraightLineKm,
      totalStraightLineKm,
    });
    if (isUsableThreshold(options.maxDailyStraightLineKm) && totalStraightLineKm > options.maxDailyStraightLineKm) {
      warnings.push({
        code: 'excessive_daily_geographic_spread', severity: 'warning',
        dayId: day.id, dayNumber: day.dayNumber, straightLineKm: totalStraightLineKm,
      });
    }
  }

  return {
    segments,
    skippedSegments,
    dailyMetrics,
    warnings,
    evaluatedSegmentCount: segments.length,
    skippedSegmentCount: skippedSegments.length,
    coverage: {
      possibleSegments: segments.length + skippedSegments.length,
      evaluatedSegments: segments.length,
      skippedSegments: skippedSegments.length,
    },
  };
}

function canonicalPlaceId(provider: string, providerPlaceId: string): string | undefined {
  const normalizedProvider = provider.trim();
  const normalizedPlaceId = providerPlaceId.trim();
  return normalizedProvider && normalizedPlaceId ? `${normalizedProvider}:${normalizedPlaceId}` : undefined;
}

function lookupCoordinate(lookup: RouteCoordinateLookup, placeId: string): RouteCoordinate | undefined {
  return lookup instanceof Map
    ? lookup.get(placeId)
    : (lookup as Readonly<Record<string, RouteCoordinate>>)[placeId];
}

function isUsableThreshold(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
