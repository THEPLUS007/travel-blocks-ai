import type { TravelPlanDraft } from '@travel-blocks/shared';

export const MAX_ITINERARY_DAYS = 30;
export const MAX_BLOCKS_PER_DAY = 12;

export type ItineraryIssueCode =
  | 'too_many_days'
  | 'duplicate_day_id'
  | 'duplicate_day_number'
  | 'non_sequential_day_number'
  | 'too_many_blocks'
  | 'duplicate_block_id'
  | 'duplicate_verified_place'
  | 'invalid_verified_place'
  | 'unknown_verified_place'
  | 'duplicate_connection_id'
  | 'missing_connection_day'
  | 'missing_connection_source'
  | 'missing_connection_target'
  | 'self_connection'
  | 'cross_day_connection';

export interface ItineraryValidationIssue {
  code: ItineraryIssueCode;
  path: string;
  message: string;
  severity: 'error';
}

export interface ItineraryValidationResult {
  valid: boolean;
  issues: ItineraryValidationIssue[];
}

export interface ItineraryValidationOptions {
  verifiedCandidateIds?: ReadonlySet<string>;
}

export class ItineraryValidationError extends Error {
  constructor(public readonly issues: ItineraryValidationIssue[]) {
    super('Itinerary constraint validation failed');
    this.name = 'ItineraryValidationError';
  }
}

export function validateItinerary(plan: TravelPlanDraft, options: ItineraryValidationOptions = {}): ItineraryValidationResult {
  const issues: ItineraryValidationIssue[] = [];
  const add = (code: ItineraryIssueCode, path: string, message: string) => issues.push({ code, path, message, severity: 'error' });
  const seenDayIds = new Set<string>();
  const seenDayNumbers = new Set<number>();
  const blockDays = new Map<string, string>();
  const seenPlaces = new Set<string>();

  if (plan.days.length > MAX_ITINERARY_DAYS) add('too_many_days', 'days', `An itinerary cannot exceed ${MAX_ITINERARY_DAYS} days.`);

  plan.days.forEach((day, dayIndex) => {
    const dayPath = `days.${dayIndex}`;
    if (seenDayIds.has(day.id)) add('duplicate_day_id', `${dayPath}.id`, 'Day IDs must be unique.');
    seenDayIds.add(day.id);
    if (seenDayNumbers.has(day.dayNumber)) add('duplicate_day_number', `${dayPath}.dayNumber`, 'Day numbers must be unique.');
    seenDayNumbers.add(day.dayNumber);
    if (day.blocks.length > MAX_BLOCKS_PER_DAY) add('too_many_blocks', `${dayPath}.blocks`, `A day cannot exceed ${MAX_BLOCKS_PER_DAY} blocks.`);

    day.blocks.forEach((block, blockIndex) => {
      const blockPath = `${dayPath}.blocks.${blockIndex}`;
      if (blockDays.has(block.id)) add('duplicate_block_id', `${blockPath}.id`, 'Block IDs must be unique across the itinerary.');
      else blockDays.set(block.id, day.id);

      if (block.place) {
        const provider = block.place.provider.trim();
        const providerPlaceId = block.place.providerPlaceId.trim();
        if (!provider || !providerPlaceId) add('invalid_verified_place', `${blockPath}.place`, 'Verified places require provider identity.');
        const placeKey = `${provider}:${providerPlaceId}`;
        if (seenPlaces.has(placeKey)) add('duplicate_verified_place', `${blockPath}.place.providerPlaceId`, 'A verified place cannot be repeated.');
        seenPlaces.add(placeKey);
        if (options.verifiedCandidateIds && !options.verifiedCandidateIds.has(placeKey)) {
          add('unknown_verified_place', `${blockPath}.place.providerPlaceId`, 'Verified place is not present in the planning candidates.');
        }
      }
    });
  });

  [...seenDayNumbers].sort((a, b) => a - b).forEach((number, index) => {
    if (number !== index + 1) add('non_sequential_day_number', 'days', 'Day numbers must be sequential from 1.');
  });

  const seenConnectionIds = new Set<string>();
  plan.connections.forEach((connection, index) => {
    const path = `connections.${index}`;
    if (seenConnectionIds.has(connection.id)) add('duplicate_connection_id', `${path}.id`, 'Connection IDs must be unique.');
    seenConnectionIds.add(connection.id);
    const sourceDay = blockDays.get(connection.sourceBlockId);
    const targetDay = blockDays.get(connection.targetBlockId);
    if (!seenDayIds.has(connection.dayId)) add('missing_connection_day', `${path}.dayId`, 'Connection day does not exist.');
    if (!sourceDay) add('missing_connection_source', `${path}.sourceBlockId`, 'Connection source block does not exist.');
    if (!targetDay) add('missing_connection_target', `${path}.targetBlockId`, 'Connection target block does not exist.');
    if (connection.sourceBlockId === connection.targetBlockId) add('self_connection', path, 'A block cannot connect to itself.');
    if ((sourceDay && sourceDay !== connection.dayId) || (targetDay && targetDay !== connection.dayId) || (sourceDay && targetDay && sourceDay !== targetDay)) {
      add('cross_day_connection', path, 'Connections must remain within their declared day.');
    }
  });

  return { valid: issues.length === 0, issues };
}

export function assertValidItinerary(plan: TravelPlanDraft, options?: ItineraryValidationOptions): TravelPlanDraft {
  const result = validateItinerary(plan, options);
  if (!result.valid) throw new ItineraryValidationError(result.issues);
  return plan;
}
