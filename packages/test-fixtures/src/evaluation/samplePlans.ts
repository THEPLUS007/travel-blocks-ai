import type { EvaluationScenario } from '@travel-blocks/domain';
import type { TravelBlock, TravelPlanDraft } from '@travel-blocks/shared';
import { evaluationScenarios } from './scenarios.js';

function block(scenario: EvaluationScenario, dayNumber: number, index: number, category: TravelBlock['category']): TravelBlock {
  const placeId = `${scenario.id.toLowerCase()}-place-${(dayNumber - 1) * 3 + index}`;
  return {
    id: `${scenario.id.toLowerCase()}-day-${dayNumber}-block-${index}`,
    title: `${scenario.expectedIntent.city} ${category} ${dayNumber}-${index}`,
    category,
    priceLevel: index === 1 ? 'low' : 'medium',
    location: scenario.expectedIntent.city,
    memo: 'Curated deterministic evaluation fixture.',
    place: { provider: 'fixture', providerPlaceId: placeId, verified: true },
  };
}

function transportMode(scenario: EvaluationScenario) {
  if (scenario.expectedIntent.mobilityPreference === 'car') return 'rental_car' as const;
  if (scenario.expectedIntent.mobilityPreference === 'public_transit') return 'subway' as const;
  if (scenario.expectedIntent.mobilityPreference === 'minimal_walking' || scenario.expectedIntent.mobilityPreference === 'accessible') return 'taxi' as const;
  return 'walk' as const;
}

export function createGoodPlan(scenario: EvaluationScenario): TravelPlanDraft {
  const days = Array.from({ length: scenario.expectedIntent.durationDays }, (_, index) => {
    const dayNumber = index + 1;
    const categories: TravelBlock['category'][] = ['sightseeing', 'food', 'cafe'];
    if (scenario.expectedIntent.requestedCategories?.includes('activity')) categories[2] = 'activity';
    const blocks = categories.map((category, blockIndex) => block(scenario, dayNumber, blockIndex + 1, category));
    return { id: `${scenario.id.toLowerCase()}-day-${dayNumber}`, dayNumber, title: `Day ${dayNumber}`, city: scenario.expectedIntent.city, blocks };
  });
  return {
    trip: {
      name: scenario.name,
      country: 'fixture-country',
      city: scenario.expectedIntent.city,
      duration: `${scenario.expectedIntent.durationDays} days`,
      budget: '', travelers: '', style: '', description: 'Static evaluation fixture only.',
    },
    days,
    connections: days.flatMap((day) => day.blocks.slice(0, -1).map((source, index) => ({
      id: `${day.id}-connection-${index + 1}`,
      dayId: day.id,
      sourceBlockId: source.id,
      targetBlockId: day.blocks[index + 1].id,
      transportMode: transportMode(scenario),
      duration: '10m',
    }))),
  };
}

function scenarioById(id: string): EvaluationScenario {
  const scenario = evaluationScenarios.find((item) => item.id === id);
  if (!scenario) throw new Error(`Unknown evaluation scenario: ${id}`);
  return scenario;
}

export const goodPlans: Record<string, TravelPlanDraft> = Object.fromEntries(
  evaluationScenarios.map((scenario) => [scenario.id, createGoodPlan(scenario)]),
);

function badPlan(scenario: EvaluationScenario): TravelPlanDraft {
  const plan = structuredClone(createGoodPlan(scenario));
  switch (scenario.id) {
    case 'EVAL-001': plan.trip.city = '인천'; break;
    case 'EVAL-002': plan.days.pop(); break;
    case 'EVAL-003':
      plan.days[1].blocks[0].place = structuredClone(plan.days[0].blocks[0].place);
      plan.connections.forEach((connection) => { connection.transportMode = 'walk'; });
      break;
    case 'EVAL-004': plan.days[1].blocks[0].id = plan.days[0].blocks[0].id; break;
    case 'EVAL-005': plan.days[0].blocks[0].place = { provider: 'fixture', providerPlaceId: 'not-a-candidate', verified: true }; break;
    case 'EVAL-006': plan.days[0].blocks = Array.from({ length: 13 }, (_, index) => ({ ...plan.days[0].blocks[0], id: `too-dense-${index}` })); break;
    case 'EVAL-007': plan.connections[0].targetBlockId = 'missing-block'; break;
    case 'EVAL-008': plan.days.forEach((day) => { day.blocks = day.blocks.map((item) => item.category === 'cafe' ? { ...item, category: 'food' } : item); }); break;
  }
  return plan;
}

export const badPlans: Record<string, TravelPlanDraft> = Object.fromEntries(
  evaluationScenarios.map((scenario) => [scenario.id, badPlan(scenario)]),
);

export const evaluationScenarioById = scenarioById;
