import { describe, expect, it } from 'vitest';
import { evaluateTravelPlan } from '@travel-blocks/domain';
import { badPlans, evaluationScenarioById, evaluationScenarios, goodPlans } from '@travel-blocks/test-fixtures';

const resultFor = (id: string, plan = goodPlans[id]) => evaluateTravelPlan(evaluationScenarioById(id), plan);
const checkFor = (id: string, rule: string, plan = goodPlans[id]) => resultFor(id, plan).checks.find((check) => check.rule === rule);

describe('deterministic travel quality evaluation', () => {
  it('passes every curated good plan', () => {
    for (const scenario of evaluationScenarios) {
      const result = resultFor(scenario.id);
      expect(result.passed, scenario.id).toBe(true);
      expect(result.score.passed, scenario.id).toBe(result.score.total);
    }
  });

  it('fails a wrong destination', () => {
    const result = resultFor('EVAL-001', badPlans['EVAL-001']);
    expect(result.passed).toBe(false);
    expect(checkFor('EVAL-001', 'destination_match', badPlans['EVAL-001'])).toMatchObject({ passed: false, severity: 'error' });
  });

  it('fails a wrong duration', () => {
    const result = resultFor('EVAL-002', badPlans['EVAL-002']);
    expect(result.passed).toBe(false);
    expect(checkFor('EVAL-002', 'duration_match', badPlans['EVAL-002'])).toMatchObject({ passed: false, severity: 'error' });
  });

  it('fails a duplicate provider place', () => {
    const result = resultFor('EVAL-003', badPlans['EVAL-003']);
    expect(result.passed).toBe(false);
    expect(checkFor('EVAL-003', 'duplicate_provider_place', badPlans['EVAL-003'])).toMatchObject({ passed: false, severity: 'error' });
  });

  it('fails an unknown or invalid verified place', () => {
    const unknown = resultFor('EVAL-005', badPlans['EVAL-005']);
    expect(checkFor('EVAL-005', 'verified_place_contract', badPlans['EVAL-005'])).toMatchObject({ passed: false, severity: 'error' });
    const invalidPlan = structuredClone(goodPlans['EVAL-005']);
    invalidPlan.days[0].blocks[0].place = { provider: '', providerPlaceId: '', verified: true };
    const invalid = resultFor('EVAL-005', invalidPlan);
    expect(unknown.passed).toBe(false);
    expect(invalid.passed).toBe(false);
    expect(checkFor('EVAL-005', 'verified_place_contract', invalidPlan)).toMatchObject({ passed: false, severity: 'error' });
  });

  it('fails excessive density and broken connection references', () => {
    expect(checkFor('EVAL-006', 'max_blocks_per_day', badPlans['EVAL-006'])).toMatchObject({ passed: false, severity: 'error' });
    expect(checkFor('EVAL-007', 'connection_reference_integrity', badPlans['EVAL-007'])).toMatchObject({ passed: false, severity: 'error' });
  });

  it('reports requested category omissions as warnings without failing the baseline', () => {
    const result = resultFor('EVAL-008', badPlans['EVAL-008']);
    expect(result.passed).toBe(true);
    expect(checkFor('EVAL-008', 'requested_category_presence', badPlans['EVAL-008'])).toMatchObject({ passed: false, severity: 'warning' });
  });

  it('reports excessive walking as a warning', () => {
    expect(checkFor('EVAL-003', 'mobility_preference_basic_check', badPlans['EVAL-003'])).toMatchObject({ passed: false, severity: 'warning' });
  });

  it('reports an excessive geographic sequence as a warning without failing the scenario', () => {
    const scenario = structuredClone(evaluationScenarioById('EVAL-003'));
    const routeCoordinates = scenario.constraints.routeCoordinates;
    if (!routeCoordinates) throw new Error('Route coordinates are required for this fixture.');
    scenario.constraints = {
      ...scenario.constraints,
      routeCoordinates: {
        ...routeCoordinates,
        'fixture:eval-003-place-2': { latitude: 35.1796, longitude: 129.0756 },
      },
      maxConsecutiveStraightLineKm: 20,
      maxDailyStraightLineKm: 40,
    };

    const result = evaluateTravelPlan(scenario, goodPlans['EVAL-003']);
    expect(result.passed).toBe(true);
    expect(result.score.passed).toBe(result.score.total - 1);
    expect(result.checks.find((check) => check.rule === 'route_distance_feasibility')).toMatchObject({
      passed: false,
      severity: 'warning',
    });
  });

  it('returns the same result for the same fixture', () => {
    expect(resultFor('EVAL-004')).toEqual(resultFor('EVAL-004'));
  });
});
