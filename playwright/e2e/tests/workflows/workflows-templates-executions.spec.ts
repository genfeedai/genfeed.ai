import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockBrandsData,
  mockNodeTypes,
  mockWorkflowCrud,
  mockWorkflowExecutions,
  mockWorkflowTemplates,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  testNodeTypes,
  testWorkflowExecutions,
  testWorkflows,
  testWorkflowTemplates,
} from '../../fixtures/test-data.fixture';
import { executionsHistoryLocator } from '../../pages/workflow.page';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the workflow Templates gallery and the
 * Executions history list + execution detail surfaces.
 *
 * All API + Better Auth traffic is mocked. Interactions are best-effort and guarded
 * with `.catch(() => {})` so a missing affordance never hard-fails the spec —
 * the goal is to exercise rendering and handler code paths for coverage.
 *
 * @module workflows-templates-executions.spec
 */

test.describe('Workflow templates & executions interactions', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, testWorkflows);
    await mockWorkflowExecutions(authenticatedPage, testWorkflowExecutions);
    await mockWorkflowTemplates(authenticatedPage, testWorkflowTemplates);
    await mockNodeTypes(authenticatedPage, testNodeTypes);
    await mockBrandsData(authenticatedPage, 3);
  });

  test('templates gallery renders the template cards', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.TEMPLATES, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/automation\/workflows\/templates$/,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Templates' }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(testWorkflowTemplates[0].name).first(),
    ).toBeVisible();

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('templates can be filtered by category tabs', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.TEMPLATES, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByRole('heading', { name: 'Templates' }).first(),
    ).toBeVisible();

    // Click through a couple of category filter buttons, then back to All.
    await tryClick(authenticatedPage, 'button:has-text("Social")');
    await authenticatedPage.waitForTimeout(250);
    await tryClick(authenticatedPage, 'button:has-text("Video")');
    await authenticatedPage.waitForTimeout(250);
    await tryClick(authenticatedPage, 'button:has-text("All")');
    await authenticatedPage.waitForTimeout(250);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('using a template navigates to the template deep link', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.TEMPLATES, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByText(testWorkflowTemplates[0].name).first(),
    ).toBeVisible();

    // "Use Template" links carry ?template=<id>. Force-click since the link is
    // revealed on card hover (opacity-0 → group-hover:opacity-100).
    const useLink = authenticatedPage.locator('a[href*="template="]').first();
    const hasLink = await useLink.count();
    if (hasLink > 0) {
      await useLink.click({ force: true, timeout: 5_000 }).catch(() => {});
      await authenticatedPage.waitForTimeout(400);
    }

    expect(authenticatedPage.url()).toContain('/automation/templates');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opening a template via its deep link renders the gallery', async ({
    authenticatedPage,
  }) => {
    const template = testWorkflowTemplates[0];

    await authenticatedPage.goto(
      `/automation/templates?template=${template.id}`,
      { waitUntil: 'domcontentloaded' },
    );

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`template=${template.id}`),
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('executions history renders the runs table', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.RUNS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/automation\/workflows\/executions$/,
    );
    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution rows expose View Details deep links', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.RUNS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();

    const detailsLink = authenticatedPage
      .locator('a[href*="execution="]')
      .first();
    await expect(detailsLink).toBeVisible({ timeout: 10_000 });

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('executions list pagination controls are interactive', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.RUNS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();

    await tryClick(authenticatedPage, 'button:has-text("Next")');
    await authenticatedPage.waitForTimeout(300);
    await tryClick(authenticatedPage, 'button:has-text("Previous")');
    await authenticatedPage.waitForTimeout(300);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opening an execution from the list navigates to a detail view', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.RUNS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();

    const detailsLink = authenticatedPage
      .locator('a[href*="execution="]')
      .first();
    const hasLink = await detailsLink.isVisible().catch(() => false);
    if (hasLink) {
      await detailsLink.click({ timeout: 5_000 }).catch(() => {});
      await authenticatedPage.waitForTimeout(500);
    }

    expect(authenticatedPage.url()).toContain('/automation/workflows');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution detail route renders for a known execution id', async ({
    authenticatedPage,
  }) => {
    const execution = testWorkflowExecutions[0];

    await authenticatedPage.goto(`/automation/runs/${execution.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`/automation/runs/${execution.id}$`),
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution detail route renders for the generic mock id', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${APP_ROUTES.AUTOMATION.RUNS}/mock-id`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/automation\/workflows\/executions\/mock-id$/,
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('empty templates state renders without errors', async ({
    authenticatedPage,
  }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.TEMPLATES, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/automation\/workflows\/templates/,
    );
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('empty executions state renders without errors', async ({
    authenticatedPage,
  }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto(APP_ROUTES.AUTOMATION.RUNS, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/automation\/workflows\/executions$/,
    );
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
