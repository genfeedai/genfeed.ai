import type { Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockAvatarIngredientActions,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

async function openAvatarRow(page: Page, label: string): Promise<void> {
  const row = page.locator('tr', { hasText: label });
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.locator('[data-testid="action-button"]').click();
}

test.describe('Avatar Library', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAvatarIngredientActions(authenticatedPage);
  });

  test('shows avatar source and video assets in the filtered avatar library', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/library/avatars', {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/library\/avatars/);
    await expect(
      authenticatedPage.getByText('Avatar Action Source'),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByText('Avatar Action Video'),
    ).toBeVisible({ timeout: 30000 });
  });

  test('opens avatar source details with default-avatar actions', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/library/avatars', {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await openAvatarRow(authenticatedPage, 'Avatar Action Source');

    await expect(
      authenticatedPage.getByTestId('ingredient-set-org-avatar'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('ingredient-set-brand-avatar'),
    ).toBeVisible();
  });

  test('hides default-avatar actions for avatar video variants', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/library/avatars', {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await openAvatarRow(authenticatedPage, 'Avatar Action Video');

    await expect(
      authenticatedPage.getByTestId('ingredient-set-org-avatar'),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByTestId('ingredient-set-brand-avatar'),
    ).toHaveCount(0);
  });
});
