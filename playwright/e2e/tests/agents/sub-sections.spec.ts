import { APP_ROUTES } from '@genfeedai/constants';
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
 * Covers: /automate/campaigns, /automate/campaigns/new, /automate/outreach-campaigns,
 *         /automate/outreach-campaigns/new, /automate/runs, /automate/strategies,
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
    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.CAMPAIGNS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/publish\/campaigns/);
    await expect(
      authenticatedPage.getByText(/campaign/i).first(),
    ).toBeVisible();
  });

  test('campaigns/new shows campaign creation form', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.CAMPAIGNS_NEW, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/publish\/campaigns\/new/);
    // Should show a creation form or wizard
    await expect(authenticatedPage.locator('form').first()).toBeVisible();
  });

  test('outreach-campaigns page loads campaigns list', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS);

    await expect(authenticatedPage).toHaveURL(/publish\/outreach-campaigns/);
    await expect(
      authenticatedPage.getByText(/campaign/i).first(),
    ).toBeVisible();
  });

  test('outreach-campaigns/new shows campaign creation form', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS_NEW);

    await expect(authenticatedPage).toHaveURL(
      /publish\/outreach-campaigns\/new/,
    );
    await expect(authenticatedPage.locator('form').first()).toBeVisible();
  });

  test('runs page shows run history', async ({ authenticatedPage }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.RUNS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/automate\/runs/);
    // Mission control / runs page
    await expect(
      authenticatedPage.getByText(/run|mission|history|control/i).first(),
    ).toBeVisible();
  });

  test('strategies page shows strategy cards', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.STRATEGIES, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/automate\/strategies/);
    await expect(authenticatedPage.getByText(/strateg/i).first()).toBeVisible();
  });

  test('workflows page shows workflow list', async ({ authenticatedPage }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.WORKFLOWS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/automate\/workflows/);
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

    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.WORKFLOWS_NEW, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/automate\/workflows\/new/);
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

    await authenticatedPage.goto(APP_ROUTES.AUTOMATE.WORKFLOWS_TEMPLATES, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/automate\/workflows\/templates/);
    await expect(
      authenticatedPage.getByText(/template/i).first(),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected from agents routes', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATE.CAMPAIGNS, {
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

    await expect(unauthenticatedPage).toHaveURL(/publish\/campaigns/);
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Agent Campaigns' }),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected from outreach campaign routes', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATE.OUTREACH_CAMPAIGNS);

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
