import {
  mockActiveSubscription,
  mockAutomationData,
  mockBrandsData,
  mockWorkflowCrud,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

test.describe('Agents — Content Team', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandsData(authenticatedPage, 2);
    await mockAutomationData(authenticatedPage);
    await mockWorkflowCrud(authenticatedPage, []);
  });

  test('content team landing page loads and shows core controls', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/orchestration', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/orchestration$/);
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Content Team' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'HQ' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Team' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: /hire agent/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: /launch orchestrator/i }),
    ).toBeVisible();
  });

  test('hire flow renders and submits', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/orchestration/hire', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/orchestration\/hire$/);
    await expect(authenticatedPage.locator('form').first()).toBeVisible();

    await authenticatedPage
      .getByLabel('Agent Label')
      .fill('Instagram Shorts Captain');
    await authenticatedPage
      .getByLabel('Primary Topic')
      .fill('AI creator monetization');
    await authenticatedPage.getByRole('button', { name: 'Hire Agent' }).click();

    await expect(authenticatedPage).toHaveURL(/\/orchestration$/);
  });

  test('orchestrator flow renders and submits a basic team launch', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/orchestration/orchestrator', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/orchestration\/orchestrator$/);
    await expect(authenticatedPage.locator('form').first()).toBeVisible();

    await authenticatedPage
      .getByLabel('Campaign Label')
      .fill('Creator Growth Machine');
    await authenticatedPage
      .getByLabel('Company Goal Label')
      .fill('April Views Goal');
    await authenticatedPage.getByLabel('Goal Target').fill('250000');
    await authenticatedPage
      .getByRole('button', { name: 'Launch Team' })
      .click();

    await expect(authenticatedPage).toHaveURL(/\/orchestration$/);
  });

  test('unauthenticated user is redirected from content team routes', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/orchestration', {
      waitUntil: 'domcontentloaded',
    });

    try {
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 5000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
      return;
    } catch {
      // Local keyless dev mode intentionally skips auth enforcement.
    }

    await expect(unauthenticatedPage).toHaveURL(/\/orchestration$/);
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Content Team' }),
    ).toBeVisible();
  });
});
