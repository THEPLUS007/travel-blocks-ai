import type { TravelBlockCategory, TravelPlanDraft } from '@travel-blocks/shared';
import { MAX_BLOCKS_PER_DAY, validateItinerary } from './itineraryValidation.js';
import { checkRouteFeasibility, type RouteCoordinate } from './routeFeasibility.js';

export type EvaluationSeverity = 'error' | 'warning' | 'info';
export type EvaluationRule =
  | 'destination_match'
  | 'duration_match'
  | 'day_number_continuity'
  | 'max_blocks_per_day'
  | 'duplicate_block_id'
  | 'duplicate_provider_place'
  | 'verified_place_contract'
  | 'connection_reference_integrity'
  | 'requested_category_presence'
  | 'mobility_preference_basic_check'
  | 'route_distance_feasibility'
  | 'requested_avoidance_violation';

export interface EvaluationIntent {
  city: string;
  durationDays: number;
  mobilityPreference?: 'walk' | 'minimal_walking' | 'public_transit' | 'car' | 'accessible';
  requestedCategories?: TravelBlockCategory[];
  avoidances?: string[];
}

export interface EvaluationConstraints {
  verifiedCandidateIds?: readonly string[];
  maxWalkConnections?: number;
  routeCoordinates?: Readonly<Record<string, RouteCoordinate>>;
  maxConsecutiveStraightLineKm?: number;
  maxDailyStraightLineKm?: number;
}

export interface EvaluationScenario {
  id: string;
  name: string;
  prompt: string;
  expectedIntent: EvaluationIntent;
  constraints: EvaluationConstraints;
  qualityRules: readonly EvaluationRule[];
}

export interface EvaluationCheck {
  rule: EvaluationRule;
  passed: boolean;
  severity: EvaluationSeverity;
  message: string;
}

export interface EvaluationResult {
  scenarioId: string;
  passed: boolean;
  score: { passed: number; total: number; percent: number };
  checks: EvaluationCheck[];
}

const connectionIssueCodes = new Set([
  'duplicate_connection_id',
  'missing_connection_day',
  'missing_connection_source',
  'missing_connection_target',
  'self_connection',
  'cross_day_connection',
]);

function normalized(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase('ko-KR') ?? '';
}

function includesAny(value: string, terms: readonly string[]): boolean {
  return terms.some((term) => normalized(term) && value.includes(normalized(term)));
}

function check(rule: EvaluationRule, passed: boolean, severity: EvaluationSeverity, message: string): EvaluationCheck {
  return { rule, passed, severity, message };
}

/** Evaluates static data only; it never calls AI, place, route, or network services. */
export function evaluateTravelPlan(scenario: EvaluationScenario, plan: TravelPlanDraft): EvaluationResult {
  const candidateIds = scenario.constraints.verifiedCandidateIds
    ? new Set(scenario.constraints.verifiedCandidateIds)
    : undefined;
  const validation = validateItinerary(plan, { verifiedCandidateIds: candidateIds });
  const issueCodes = new Set(validation.issues.map((issue) => issue.code));
  const requestedCategories = scenario.expectedIntent.requestedCategories ?? [];
  const categorySet = new Set(plan.days.flatMap((day) => day.blocks.map((block) => block.category)));
  const walkConnections = plan.connections.filter((connection) => connection.transportMode === 'walk').length;
  const connectionModes = new Set(plan.connections.map((connection) => connection.transportMode));
  const maxWalkConnections = scenario.constraints.maxWalkConnections ?? 1;
  const routeFeasibility = scenario.constraints.routeCoordinates
    ? checkRouteFeasibility(plan, scenario.constraints.routeCoordinates, {
        maxConsecutiveStraightLineKm: scenario.constraints.maxConsecutiveStraightLineKm,
        maxDailyStraightLineKm: scenario.constraints.maxDailyStraightLineKm,
      })
    : undefined;
  const searchablePlanText = plan.days
    .flatMap((day) => day.blocks.map((block) => [block.title, block.location, block.memo].filter(Boolean).join(' ')))
    .join(' ')
    .toLocaleLowerCase('ko-KR');

  const allChecks: Record<EvaluationRule, EvaluationCheck> = {
    destination_match: check('destination_match', normalized(plan.trip.city) === normalized(scenario.expectedIntent.city), 'error', `Expected destination ${scenario.expectedIntent.city}; received ${plan.trip.city || '(empty)'}.`),
    duration_match: check('duration_match', plan.days.length === scenario.expectedIntent.durationDays, 'error', `Expected ${scenario.expectedIntent.durationDays} days; received ${plan.days.length}.`),
    day_number_continuity: check('day_number_continuity', !issueCodes.has('duplicate_day_number') && !issueCodes.has('non_sequential_day_number'), 'error', 'Day numbers must be unique and sequential from 1.'),
    max_blocks_per_day: check('max_blocks_per_day', !issueCodes.has('too_many_blocks') && plan.days.every((day) => day.blocks.length <= MAX_BLOCKS_PER_DAY), 'error', `Each day must contain at most ${MAX_BLOCKS_PER_DAY} blocks.`),
    duplicate_block_id: check('duplicate_block_id', !issueCodes.has('duplicate_block_id'), 'error', 'Block IDs must be unique across the itinerary.'),
    duplicate_provider_place: check('duplicate_provider_place', !issueCodes.has('duplicate_verified_place'), 'error', 'Verified provider places must not be repeated.'),
    verified_place_contract: check('verified_place_contract', !issueCodes.has('invalid_verified_place') && !issueCodes.has('unknown_verified_place'), 'error', 'Verified places require a valid provider identity and scenario candidate membership.'),
    connection_reference_integrity: check('connection_reference_integrity', !validation.issues.some((issue) => connectionIssueCodes.has(issue.code)), 'error', 'Connections must have unique IDs and reference blocks in their declared day.'),
    requested_category_presence: check('requested_category_presence', requestedCategories.every((category) => categorySet.has(category)), 'warning', requestedCategories.length ? `Requested categories: ${requestedCategories.join(', ')}.` : 'No requested categories were declared.'),
    mobility_preference_basic_check: check('mobility_preference_basic_check', mobilityMatches(scenario.expectedIntent.mobilityPreference, walkConnections, maxWalkConnections, connectionModes), 'warning', mobilityMessage(scenario.expectedIntent.mobilityPreference, walkConnections, maxWalkConnections)),
    route_distance_feasibility: check(
      'route_distance_feasibility',
      !routeFeasibility || routeFeasibility.warnings.length === 0,
      'warning',
      routeFeasibility
        ? `${routeFeasibility.coverage.evaluatedSegments}/${routeFeasibility.coverage.possibleSegments} geographic segments evaluated.`
        : 'No route coordinates were supplied for this scenario.',
    ),
    requested_avoidance_violation: check('requested_avoidance_violation', !includesAny(searchablePlanText, scenario.expectedIntent.avoidances ?? []), 'warning', scenario.expectedIntent.avoidances?.length ? `Avoided terms: ${scenario.expectedIntent.avoidances.join(', ')}.` : 'No avoidance terms were declared.'),
  };

  const checks = scenario.qualityRules.map((rule) => allChecks[rule]);
  const passedChecks = checks.filter((result) => result.passed).length;
  return {
    scenarioId: scenario.id,
    passed: !checks.some((result) => !result.passed && result.severity === 'error'),
    score: { passed: passedChecks, total: checks.length, percent: checks.length ? Math.round((passedChecks / checks.length) * 100) : 100 },
    checks,
  };
}

function mobilityMatches(preference: EvaluationIntent['mobilityPreference'], walkConnections: number, maxWalkConnections: number, connectionModes: ReadonlySet<string | undefined>): boolean {
  if (!preference || preference === 'walk') return true;
  if (preference === 'minimal_walking' || preference === 'accessible') return walkConnections <= maxWalkConnections;
  if (preference === 'car') return connectionModes.size === 0 || connectionModes.has('rental_car');
  if (preference === 'public_transit') return connectionModes.size === 0 || connectionModes.has('bus') || connectionModes.has('subway');
  return true;
}

function mobilityMessage(preference: EvaluationIntent['mobilityPreference'], walkConnections: number, maxWalkConnections: number): string {
  if (!preference) return 'No mobility preference was declared.';
  if (preference === 'minimal_walking' || preference === 'accessible') return `${preference} permits at most ${maxWalkConnections} walk connections; received ${walkConnections}.`;
  return `Basic ${preference} transport-mode check.`;
}
