import { expect, test } from '@playwright/test';

test('app contract smoke with test providers: generate, recommend, save, reopen, connect, refresh', async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());

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
