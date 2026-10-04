import { expect, test } from '@playwright/test';

test('app contract smoke with test providers: generate, recommend, save, reopen, connect, refresh', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  let discoveryCalls = 0;
  let decisionCalls = 0;
  const timestamp = '2026-10-04T00:00:00.000Z';
  const policy = { id: 'deterministic-travel-selection', version: 'v1' };
  const provenance = { traceId: 'fixture-http-request', decisionSource: 'deterministic', producedAt: timestamp };
  const candidateSet = {
    contractVersion: 'decision_candidate_discovery_response_v1',
    candidateSetId: 'fixture-candidate-set',
    tripContext: { tripContextId: 'review-day-1', destination: { city: '서울' } },
    constraints: { requestedCategories: [], preferences: ['도보'], avoidances: [] },
    canonicalOrder: 'candidate_id_ascending',
    candidates: [
      { candidateId: 'fixture-a', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'a' }, displayName: '선택 후보', category: 'sightseeing' },
      { candidateId: 'fixture-b', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'b' }, displayName: '제외 후보', category: 'food' },
      { candidateId: 'fixture-c', providerReference: { sourceSystem: 'fixture', sourceRecordId: 'c' }, displayName: '확인 후보', category: 'cafe' },
    ],
  };
  await page.route('**/api/v1/decision-candidates/discover', async (route) => {
    discoveryCalls += 1;
    if (discoveryCalls === 1) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ contractVersion: 'decision_candidate_discovery_error_v1', error: { code: 'FACTUAL_DEPENDENCY_FAILURE', message: 'safe', retryable: true, requestId: 'fixture-request' } }) });
      return;
    }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(candidateSet) });
  });
  await page.route('**/api/v1/decisions/evaluate', async (route) => {
    decisionCalls += 1;
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      contractVersion: 'decision_api_response_v1', requestId: 'fixture-http-request', decisionRequestId: 'fixture-decision-request', resultId: 'fixture-result', policy,
      judge: { outcome: 'skipped', reason: 'disabled' }, coverage: { status: 'partial', evaluatedCandidates: 2, unresolvedCandidates: 1 }, candidates: candidateSet.candidates.map(({ candidateId, displayName, category }) => ({ candidateId, displayName, category })),
      decisionResult: {
        contractVersion: 'decision_result_v1', resultId: 'fixture-result', requestId: 'fixture-decision-request', policy, createdAt: timestamp, completeness: 'partial', coverage: { status: 'partial', evaluatedCandidates: 2, unresolvedCandidates: 1 }, provenance,
        decisions: [
          { candidateId: 'fixture-a', policy, status: 'selected', reason: { category: 'deterministic_rule', code: 'candidate_selected' }, evidence: [], provenance },
          { candidateId: 'fixture-b', policy, status: 'rejected', reason: { category: 'selection_limit', code: 'selection_limit' }, evidence: [], provenance },
          { candidateId: 'fixture-c', policy, status: 'unresolved', reason: { category: 'insufficient_facts', code: 'missing_required_facts' }, evidence: [], provenance },
        ],
      },
    }) });
  });

  await page.goto('/');
  await expect(page.getByTestId('new-user-screen')).toBeVisible();

  await page.getByTestId('onboarding-mode-ai').click();
  await page
    .getByPlaceholder(/3박4일 제주|커플 여행/)
    .fill('오사카 2박 3일, 첫 해외여행, 맛집과 쇼핑 중심으로 짜줘. Day마다 블록을 최소 4개 만들어줘.');
  await page.getByTestId('generate-trip-button').click();

  await expect(page.getByTestId('trip-editor-screen')).toBeVisible({ timeout: 90_000 });
  await expect.poll(async () => page.locator('article').count(), { timeout: 30_000 }).toBeGreaterThan(2);
  await expect(page.getByTestId('trust-panel')).toBeVisible();
  await expect(page.getByText('0 / 4 블록이 장소 제공자 정보와 연결되어 있습니다.')).toBeVisible();
  await expect(page.locator('article').getByText('장소 미확인')).toHaveCount(4);
  await expect(page.getByText('영업시간은 현재 일정 생성 경로에서 확인되지 않았습니다.')).toBeVisible();
  await expect(page.getByText('실제 경로와 이동시간은 현재 제공되지 않습니다.')).toBeVisible();
  await expect(page.getByText('영업 중')).toHaveCount(0);
  await expect(page.getByText('방문 가능')).toHaveCount(0);

  await page.getByTestId('recommendation-button').click();
  await expect(page.getByTestId('recommendation-card').first()).toBeVisible({ timeout: 45_000 });
  await expect.poll(async () => page.getByTestId('recommendation-card').count(), { timeout: 30_000 }).toBeGreaterThan(2);
  await expect(page.getByTestId('recommendation-card').first().getByText('장소 확인됨')).toBeVisible();
  await page.getByTestId('review-candidates-button').click();
  await expect(page.getByText('장소 후보를 불러오지 못했습니다.')).toBeVisible();
  await page.getByRole('button', { name: '다시 시도' }).click();
  await expect(page.getByTestId('considered-places-panel')).toBeVisible();
  await expect(page.getByText('일정 생성 과정에서 함께 검토한 장소')).toBeVisible();
  await expect(page.getByRole('heading', { name: '일정에 포함할 장소' })).toBeVisible();
  await expect(page.getByText('이번 일정에서는 제외')).toBeVisible();
  await expect(page.getByText('정보 확인 필요')).toBeVisible();
  await expect(page.getByText('선택 후보')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('fixture-a');
  await expect(page.locator('body')).not.toContainText('selection_limit');
  expect(discoveryCalls).toBe(2);
  expect(decisionCalls).toBe(1);
  await page.setViewportSize({ width: 360, height: 720 });
  await expect(page.getByTestId('considered-places-panel')).toBeVisible();
  await page.getByTestId('recommendation-card').first().click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('장소 확인됨')).toHaveCount(1);
  await expect(page.getByText('1 / 5 블록이 장소 제공자 정보와 연결되어 있습니다.')).toBeVisible();

  await page.getByTestId('save-trip-button').click();
  await expect(page.getByText('저장되었습니다.')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('exit-trip-button').click();
  await expect(page.getByTestId('trip-list-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('saved-plan-card').first()).toBeVisible();

  await page.getByTestId('saved-plan-card').first().click();
  await expect(page.getByTestId('trip-editor-screen')).toBeVisible();

  await page.getByLabel('블록 메뉴').first().click();
  await page.getByTestId('connect-mode-button').click();
  await expect(page.getByTestId('connect-target-button')).toHaveCount(1);

  await page.getByTestId('connect-target-button').click();
  await expect(page.getByText(/로 연결했습니다/)).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('save-trip-button').click();
  await expect(page.getByText('저장되었습니다.')).toBeVisible({ timeout: 30_000 });

  await page.getByTestId('exit-trip-button').click();
  await expect(page.getByTestId('trip-list-screen')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('trip-list-screen')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('saved-plan-card').first()).toBeVisible();
});
