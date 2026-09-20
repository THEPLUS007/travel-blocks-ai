import type { EvaluationRule, EvaluationScenario } from '@travel-blocks/domain';
import { evaluationCandidateIds } from './expectedPlaces.js';
import { evaluationCoordinatesForScenario } from './placeCoordinates.js';

const baselineRules: readonly EvaluationRule[] = [
  'destination_match',
  'duration_match',
  'day_number_continuity',
  'max_blocks_per_day',
  'duplicate_block_id',
  'duplicate_provider_place',
  'verified_place_contract',
  'connection_reference_integrity',
  'requested_category_presence',
  'mobility_preference_basic_check',
];

function scenario(input: Omit<EvaluationScenario, 'constraints' | 'qualityRules'> & {
  maxWalkConnections?: number;
  maxConsecutiveStraightLineKm?: number;
  maxDailyStraightLineKm?: number;
  includeAvoidanceRule?: boolean;
}): EvaluationScenario {
  return {
    id: input.id,
    name: input.name,
    prompt: input.prompt,
    expectedIntent: input.expectedIntent,
    constraints: {
      verifiedCandidateIds: evaluationCandidateIds(input.id, input.expectedIntent.durationDays),
      maxWalkConnections: input.maxWalkConnections,
      routeCoordinates: evaluationCoordinatesForScenario(input.id, input.expectedIntent.city, input.expectedIntent.durationDays),
      maxConsecutiveStraightLineKm: input.maxConsecutiveStraightLineKm ?? 10,
      maxDailyStraightLineKm: input.maxDailyStraightLineKm ?? 20,
    },
    qualityRules: input.includeAvoidanceRule
      ? [...baselineRules, 'route_distance_feasibility', 'requested_avoidance_violation']
      : [...baselineRules, 'route_distance_feasibility'],
  };
}

export const evaluationScenarios: readonly EvaluationScenario[] = [
  scenario({
    id: 'EVAL-001', name: 'Seoul First Trip', prompt: '서울 1박 2일 첫 여행 일정을 만들어줘',
    expectedIntent: { city: '서울', durationDays: 2, requestedCategories: ['sightseeing', 'food'] },
  }),
  scenario({
    id: 'EVAL-002', name: 'Busan Food Focus', prompt: '부산 2박 3일 맛집 중심 여행',
    expectedIntent: { city: '부산', durationDays: 3, requestedCategories: ['food'] },
  }),
  scenario({
    id: 'EVAL-003', name: 'Osaka Minimal Walking', prompt: '오사카 3박 4일 맛집 중심, 많이 걷지 않는 일정',
    expectedIntent: { city: '오사카', durationDays: 4, mobilityPreference: 'minimal_walking', requestedCategories: ['food'], avoidances: ['도보 중심'] },
    maxWalkConnections: 1, includeAvoidanceRule: true,
  }),
  scenario({
    id: 'EVAL-004', name: 'Jeju Rental Car', prompt: '제주 2박 3일 렌터카 중심 여행',
    expectedIntent: { city: '제주', durationDays: 3, mobilityPreference: 'car', requestedCategories: ['sightseeing'] },
  }),
  scenario({
    id: 'EVAL-005', name: 'Tokyo Budget', prompt: '도쿄 4박 5일 저예산 여행',
    expectedIntent: { city: '도쿄', durationDays: 5, requestedCategories: ['food', 'sightseeing'] },
  }),
  scenario({
    id: 'EVAL-006', name: 'Gyeongju Parents Minimal Walking', prompt: '부모님과 경주 2박 3일, 걷는 일정 최소화',
    expectedIntent: { city: '경주', durationDays: 3, mobilityPreference: 'minimal_walking', requestedCategories: ['sightseeing'], avoidances: ['긴 도보'] },
    maxWalkConnections: 1, includeAvoidanceRule: true,
  }),
  scenario({
    id: 'EVAL-007', name: 'Seoul Family With Children', prompt: '아이 포함 가족 서울 여행',
    expectedIntent: { city: '서울', durationDays: 2, mobilityPreference: 'accessible', requestedCategories: ['activity', 'food'] },
    maxWalkConnections: 1,
  }),
  scenario({
    id: 'EVAL-008', name: 'Busan Solo Cafe And Sightseeing', prompt: '혼자 카페와 관광 중심 부산 여행',
    expectedIntent: { city: '부산', durationDays: 2, requestedCategories: ['cafe', 'sightseeing'] },
  }),
];
