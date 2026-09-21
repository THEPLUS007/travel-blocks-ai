import type { TravelPlanDraft } from '@travel-blocks/shared';

export type OpeningHoursStatus = 'feasible' | 'caution' | 'infeasible' | 'unknown';
export type OpeningHoursBusinessStatus = 'operational' | 'temporarily_closed' | 'permanently_closed' | 'future_opening' | 'unknown';
export type OpeningHoursDataQualityFlag =
  | 'opening_hours_missing'
  | 'current_hours_unavailable'
  | 'regular_hours_only'
  | 'timezone_missing'
  | 'trip_date_missing'
  | 'trip_date_invalid'
  | 'block_time_missing'
  | 'block_time_unparseable'
  | 'outside_current_hours_window'
  | 'special_hours_unknown'
  | 'business_temporarily_closed'
  | 'business_permanently_closed'
  | 'invalid_opening_period';

export interface OpeningHoursPeriod {
  openDay: number;
  openTime: string;
  closeDay?: number;
  closeTime?: string;
  openDate?: string;
  closeDate?: string;
}

export interface OpeningHoursSchedule {
  periods: readonly OpeningHoursPeriod[];
  coverageStart?: string;
  coverageEnd?: string;
}

export interface PlaceOpeningHoursSnapshot {
  provider: string;
  providerPlaceId: string;
  source: string;
  retrievedAt: string;
  businessStatus?: OpeningHoursBusinessStatus;
  timeZone?: string;
  currentHours?: OpeningHoursSchedule;
  regularHours?: OpeningHoursSchedule;
  dataQualityFlags: readonly OpeningHoursDataQualityFlag[];
}

export type OpeningHoursFactsLookup = Readonly<Record<string, PlaceOpeningHoursSnapshot>> | ReadonlyMap<string, PlaceOpeningHoursSnapshot>;

export interface OpeningHoursFeasibilityOptions {
  tripStartDate?: string;
}

export interface OpeningHoursPlaceResult {
  dayId: string;
  dayNumber: number;
  blockId: string;
  placeId: string;
  targetDate?: string;
  targetTime?: { start: string; end: string };
  status: OpeningHoursStatus;
  source?: string;
  dataQualityFlags: OpeningHoursDataQualityFlag[];
}

export interface OpeningHoursFeasibilityResult {
  places: OpeningHoursPlaceResult[];
  summary: Record<OpeningHoursStatus, number>;
  coverage: {
    possiblePlaces: number;
    evaluatedPlaces: number;
    unknownPlaces: number;
    skippedPlaces: number;
  };
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseBlockTime(value: string | undefined): { start: string; end: string } | undefined {
  if (!value) return undefined;
  const match = value.trim().match(/^((?:[01]\d|2[0-3]):[0-5]\d)(?:\s*-\s*((?:[01]\d|2[0-3]):[0-5]\d))?$/);
  if (!match || !CLOCK_PATTERN.test(match[1])) return undefined;
  return { start: match[1], end: match[2] ?? match[1] };
}

export function isValidIsoDate(value: string | undefined): value is string {
  if (!value || !ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function checkOpeningHoursFeasibility(
  plan: TravelPlanDraft,
  facts: OpeningHoursFactsLookup,
  options: OpeningHoursFeasibilityOptions = {},
): OpeningHoursFeasibilityResult {
  const places: OpeningHoursPlaceResult[] = [];
  const summary: Record<OpeningHoursStatus, number> = { feasible: 0, caution: 0, infeasible: 0, unknown: 0 };
  const hasTripDate = isValidIsoDate(options.tripStartDate);

  for (const day of plan.days) {
    const targetDate = hasTripDate ? addDays(options.tripStartDate!, day.dayNumber - 1) : undefined;
    for (const block of day.blocks) {
      if (!block.place) continue;
      const placeId = canonicalPlaceId(block.place.provider, block.place.providerPlaceId);
      if (!placeId) continue;
      const snapshot = lookupFact(facts, placeId);
      const flags = new Set<OpeningHoursDataQualityFlag>(snapshot?.dataQualityFlags ?? []);
      const parsedTime = parseBlockTime(block.time);
      if (!hasTripDate) flags.add(options.tripStartDate ? 'trip_date_invalid' : 'trip_date_missing');
      if (!parsedTime) flags.add(block.time ? 'block_time_unparseable' : 'block_time_missing');

      let status: OpeningHoursStatus;
      const source = snapshot?.source;
      if (!snapshot) {
        flags.add('opening_hours_missing');
        status = 'unknown';
      } else if (snapshot.businessStatus === 'permanently_closed') {
        flags.add('business_permanently_closed');
        status = 'infeasible';
      } else if (!snapshot.currentHours && !snapshot.regularHours) {
        flags.add('opening_hours_missing');
        status = 'unknown';
      } else if (!targetDate || !parsedTime) {
        status = 'unknown';
      } else {
        const selected = selectSchedule(snapshot, targetDate, flags);
        if (!selected) {
          flags.add('current_hours_unavailable');
          status = 'unknown';
        } else if (snapshot.businessStatus === 'temporarily_closed') {
          flags.add('business_temporarily_closed');
          status = 'caution';
        } else if (!periodContains(selected.schedule.periods, targetDate, parsedTime)) {
          flags.add('outside_current_hours_window');
          status = 'infeasible';
        } else {
          status = hasCautionFlags(flags) ? 'caution' : 'feasible';
        }
      }

      const result: OpeningHoursPlaceResult = {
        dayId: day.id,
        dayNumber: day.dayNumber,
        blockId: block.id,
        placeId,
        targetDate,
        targetTime: parsedTime,
        status,
        source,
        dataQualityFlags: [...flags],
      };
      places.push(result);
      summary[status] += 1;
    }
  }

  return {
    places,
    summary,
    coverage: { possiblePlaces: places.length, evaluatedPlaces: places.length, unknownPlaces: summary.unknown, skippedPlaces: 0 },
  };
}

function selectSchedule(snapshot: PlaceOpeningHoursSnapshot, targetDate: string, flags: Set<OpeningHoursDataQualityFlag>) {
  if (snapshot.currentHours && scheduleCoversDate(snapshot.currentHours, targetDate)) {
    return { schedule: snapshot.currentHours, current: true };
  }
  if (snapshot.currentHours) flags.add('outside_current_hours_window');
  if (snapshot.regularHours) {
    flags.add('regular_hours_only');
    flags.add('special_hours_unknown');
    return { schedule: snapshot.regularHours, current: false };
  }
  return snapshot.currentHours ? { schedule: snapshot.currentHours, current: true } : undefined;
}

function periodContains(periods: readonly OpeningHoursPeriod[], targetDate: string, requested: { start: string; end: string }): boolean {
  const targetStart = minutes(requested.start);
  let targetEnd = minutes(requested.end);
  if (targetStart === undefined || targetEnd === undefined) return false;
  if (targetEnd < targetStart) targetEnd += 1440;
  for (const period of periods) {
    const openMinutes = minutes(period.openTime);
    if (openMinutes === undefined) continue;
    for (let offset = -1; offset <= 0; offset += 1) {
      const occurrenceDate = addDays(targetDate, offset);
      if (period.openDate ? period.openDate !== occurrenceDate : period.openDay !== weekday(occurrenceDate)) continue;
      const openAbsolute = offset * 1440 + openMinutes;
      let closeAbsolute: number;
      if (period.closeTime === undefined) {
        closeAbsolute = openAbsolute + 1440;
      } else {
        const closeMinutes = minutes(period.closeTime);
        if (closeMinutes === undefined) continue;
        const closeDateOffset = period.closeDate ? dayDistance(occurrenceDate, period.closeDate) : dayDelta(period.openDay, period.closeDay ?? period.openDay);
        closeAbsolute = closeDateOffset * 1440 + closeMinutes;
        if (closeAbsolute <= openAbsolute) closeAbsolute += 7 * 1440;
      }
      const requestOffset = dayDistance(occurrenceDate, targetDate);
      const requestAbsoluteStart = requestOffset * 1440 + targetStart;
      const requestAbsoluteEnd = requestOffset * 1440 + targetEnd;
      if (requestAbsoluteStart >= openAbsolute && requestAbsoluteEnd <= closeAbsolute) return true;
    }
  }
  return false;
}

function scheduleCoversDate(schedule: OpeningHoursSchedule, targetDate: string): boolean {
  if (!schedule.coverageStart && !schedule.coverageEnd) return true;
  if (schedule.coverageStart && targetDate < schedule.coverageStart) return false;
  if (schedule.coverageEnd && targetDate > schedule.coverageEnd) return false;
  return true;
}

function hasCautionFlags(flags: Set<OpeningHoursDataQualityFlag>): boolean {
  return flags.has('regular_hours_only') || flags.has('special_hours_unknown') || flags.has('timezone_missing') || flags.has('outside_current_hours_window');
}

function lookupFact(facts: OpeningHoursFactsLookup, placeId: string): PlaceOpeningHoursSnapshot | undefined {
  return facts instanceof Map ? facts.get(placeId) : (facts as Readonly<Record<string, PlaceOpeningHoursSnapshot>>)[placeId];
}

function canonicalPlaceId(provider: string, providerPlaceId: string): string | undefined {
  const normalizedProvider = provider.trim();
  const normalizedId = providerPlaceId.trim();
  return normalizedProvider && normalizedId ? `${normalizedProvider}:${normalizedId}` : undefined;
}

function minutes(value: string | undefined): number | undefined {
  if (!value || !CLOCK_PATTERN.test(value)) return undefined;
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(value: string): number {
  return new Date(`${value}T00:00:00Z`).getUTCDay();
}

function dayDistance(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function dayDelta(openDay: number, closeDay: number): number {
  return (closeDay - openDay + 7) % 7;
}
