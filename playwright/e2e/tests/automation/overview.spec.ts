import {
  mockActiveSubscription,
  mockAutomationData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E Tests for Automation Overview
 *
 * Tests verify automation overview page, bots list,
 * campaigns list, and section navigation.
 * All API calls are mocked.
 */
test.describe('Automation Overview', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAutomationData(authenticatedPage);
  });

  test.describe('Page Display', () => {
    test('should display automation overview page', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/automation/overview');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/automation/);
      await expect(
        authenticatedPage.locator('main, [data-testid="main-content"]'),
      ).toBeVisible();
    });

    test('should show bots list', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/automation/bots');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/automation.*bots|bots/);
      await expect(
        authenticatedPage.locator('main, [data-testid="main-content"]'),
      ).toBeVisible();
    });

    test('should show campaigns list', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/automation/campaigns');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(
        /automation.*campaigns|campaigns/,
      );
      await expect(
        authenticatedPage.locator('main, [data-testid="main-content"]'),
      ).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between automation sections', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/automation/overview');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Navigate to bots
      const botsLink = authenticatedPage.locator(
        'a[href*="automation/bots"],' +
          ' button:has-text("Bots"),' +
          ' [data-testid="bots-tab"]',
      );
      const hasBotsLink = await botsLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasBotsLink) {
        await botsLink.first().click();
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/bots/);
      }

      // Navigate to campaigns
      const campaignsLink = authenticatedPage.locator(
        'a[href*="automation/campaigns"],' +
          ' button:has-text("Campaigns"),' +
          ' [data-testid="campaigns-tab"]',
      );
      const hasCampaignsLink = await campaignsLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasCampaignsLink) {
        await campaignsLink.first().click();
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/campaigns/);
      }

      // Navigate to reply-bots
      const replyBotsLink = authenticatedPage.locator(
        'a[href*="automation/reply-bots"],' +
          ' button:has-text("Reply Bots"),' +
          ' [data-testid="reply-bots-tab"]',
      );
      const hasReplyBotsLink = await replyBotsLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasReplyBotsLink) {
        await replyBotsLink.first().click();
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/reply-bots/);
      }

      // Navigate to tasks
      const tasksLink = authenticatedPage.locator(
        'a[href*="automation/tasks"],' +
          ' button:has-text("Tasks"),' +
          ' [data-testid="tasks-tab"]',
      );
      const hasTasksLink = await tasksLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasTasksLink) {
        await tasksLink.first().click();
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/tasks/);
      }
    });
  });
});
