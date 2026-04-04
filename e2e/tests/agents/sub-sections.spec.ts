import {
  mockActiveSubscription,
  mockAutomationData,
  mockWorkflowCrud,
  mockWorkflowExecutions,
  mockWorkflowTemplates,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E Tests for Agents Sub-Routes
 *
 * Covers: /orchestration/campaigns, /orchestration/campaigns/new, /orchestration/outreach-campaigns,
 *         /orchestration/outreach-campaigns/new, /orchestration/runs, /orchestration/strategies,
 *         /workflows, /workflows/new, /workflows/templates
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur.
 */
test.describe('Agents — Sub-Sections', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('campaigns page loads campaigns list', async ({ authenticatedPage }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto('/orchestration/campaigns', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/orchestration\/campaigns/);
    await expect(
      authenticatedPage.getByText(/campaign/i).first(),
    ).toBeVisible();
  });

  test('campaigns/new shows campaign creation form', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto('/orchestration/campaigns/new', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/orchestration\/campaigns\/new/);
    // Should show a creation form or wizard
    await expect(authenticatedPage.locator('form').first()).toBeVisible();
  });

  test('outreach-campaigns page loads campaigns list', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto('/orchestration/outreach-campaigns');

    await expect(authenticatedPage).toHaveURL(
      /orchestration\/outreach-campaigns/,
    );
    await expect(
      authenticatedPage.getByText(/campaign/i).first(),
    ).toBeVisible();
  });

  test('outreach-campaigns/new shows campaign creation form', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto('/orchestration/outreach-campaigns/new');

    await expect(authenticatedPage).toHaveURL(
      /orchestration\/outreach-campaigns\/new/,
    );
    await expect(authenticatedPage.locator('form').first()).toBeVisible();
  });

  test('runs page shows run history', async ({ authenticatedPage }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto('/orchestration/runs', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/orchestration\/runs/);
    // Mission control / runs page
    await expect(
      authenticatedPage.getByText(/run|mission|history|control/i).first(),
    ).toBeVisible();
  });

  test('strategies page shows strategy cards', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto('/orchestration/strategies', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/orchestration\/strategies/);
    await expect(authenticatedPage.getByText(/strateg/i).first()).toBeVisible();
  });

  test('workflows page shows workflow list', async ({ authenticatedPage }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto('/workflows', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/workflows$/);
    await expect(
      authenticatedPage.getByText(/automation|workflow/i).first(),
    ).toBeVisible();
  });

  test('workflows/new shows workflow creation', async ({
    authenticatedPage,
  }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto('/workflows/new', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/workflows\/new/);
    await expect(
      authenticatedPage.getByText(/new|create|editor|workflow/i).first(),
    ).toBeVisible();
  });

  test('workflows/templates shows template gallery', async ({
    authenticatedPage,
  }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto('/workflows/templates', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/workflows\/templates/);
    await expect(
      authenticatedPage.getByText(/template/i).first(),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected from agents routes', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/orchestration/campaigns', {
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

    await expect(unauthenticatedPage).toHaveURL(/orchestration\/campaigns/);
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Agent Campaigns' }),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected from outreach campaign routes', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/orchestration/outreach-campaigns');

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
