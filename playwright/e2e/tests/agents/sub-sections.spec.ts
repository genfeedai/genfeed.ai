import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAutomationData,
  mockWorkflowCrud,
  mockWorkflowExecutions,
  mockWorkflowTemplates,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

/**
 * E2E Tests for Agents Sub-Routes
 *
 * Covers: /automate/campaigns (Programs), /automate/campaigns/new,
 *         /messages/outreach, /messages/outreach/new, /automate/runs,
 *         /automate/autopilot, /workflows, /workflows/new, /workflows/templates
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

  test('programs page loads programs list', async ({ authenticatedPage }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATE.CAMPAIGNS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/automate\/campaigns/);
    await expect(authenticatedPage.getByText(/program/i).first()).toBeVisible();
  });

  test('campaigns/new shows program creation form', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATE.CAMPAIGNS_NEW), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/automate\/campaigns\/new/);
    // Should show a creation form or wizard
    await expect(authenticatedPage.locator('form').first()).toBeVisible();
  });

  test('outreach sequences page loads under Messages', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(brandPath(APP_ROUTES.MESSAGES.OUTREACH));

    await expect(authenticatedPage).toHaveURL(/messages\/outreach/);
    await expect(
      authenticatedPage.getByText(/outreach/i).first(),
    ).toBeVisible();
  });

  test('outreach/new shows sequence creation form', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(brandPath(APP_ROUTES.MESSAGES.OUTREACH_NEW));

    await expect(authenticatedPage).toHaveURL(/messages\/outreach\/new/);
    await expect(
      authenticatedPage.getByRole('heading', { name: /Platform & Type/i }),
    ).toBeVisible();
  });

  test('runs page shows run history', async ({ authenticatedPage }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATE.RUNS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/automate\/runs/);
    // Mission control / runs page
    await expect(
      authenticatedPage.getByText(/run|mission|history|control/i).first(),
    ).toBeVisible();
  });

  test('autopilot page is the strategies desk', async ({
    authenticatedPage,
  }) => {
    await mockAutomationData(authenticatedPage);
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATE.AUTOPILOT), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automate\/autopilot/);
    await expect(
      authenticatedPage.getByText(/autopilot/i).first(),
    ).toBeVisible();
  });

  test('workflows page shows workflow list', async ({ authenticatedPage }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATE.WORKFLOWS), {
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

    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATE.WORKFLOWS_NEW), {
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

    await authenticatedPage.goto(
      brandPath(APP_ROUTES.AUTOMATE.WORKFLOWS_TEMPLATES),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(authenticatedPage).toHaveURL(/automate\/workflows\/templates/);
    await expect(
      authenticatedPage.getByText(/template/i).first(),
    ).toBeVisible();
  });
});

test.describe('Agents — Sub-Sections — unauthenticated', () => {
  test('unauthenticated user is redirected from agents routes', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATE.CAMPAIGNS, {
      waitUntil: 'domcontentloaded',
    });
    await unauthenticatedPage.waitForURL(/\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/login/);
  });

  test('unauthenticated user is redirected from outreach sequence routes', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.MESSAGES.OUTREACH);

    await unauthenticatedPage.waitForURL(/\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/login/);
  });
});
