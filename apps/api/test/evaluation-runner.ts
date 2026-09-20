import { evaluateTravelPlan } from '@travel-blocks/domain';
import { evaluationScenarios, goodPlans } from '@travel-blocks/test-fixtures';

console.log('Travel Blocks AI Evaluation\n');

const results = evaluationScenarios.map((scenario) => ({
  scenario,
  result: evaluateTravelPlan(scenario, goodPlans[scenario.id]),
}));

for (const { scenario, result } of results) {
  console.log(`${scenario.id} ${scenario.name}`);
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.score.passed}/${result.score.total}`);
  for (const failed of result.checks.filter((check) => !check.passed)) {
    console.log(`${failed.severity.toUpperCase()} ${failed.rule}`);
  }
  console.log('');
}

const passedScenarios = results.filter(({ result }) => result.passed).length;
const passedChecks = results.reduce((total, { result }) => total + result.score.passed, 0);
const totalChecks = results.reduce((total, { result }) => total + result.score.total, 0);
console.log('Summary\n');
console.log(`${results.length} scenarios`);
console.log(`${passedScenarios} passed`);
console.log(`${passedChecks} / ${totalChecks} checks`);

if (passedScenarios !== results.length) process.exitCode = 1;
