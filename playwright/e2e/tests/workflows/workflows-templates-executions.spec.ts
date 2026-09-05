import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
import { brandPath } from '../../utils/app-chrome';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the workflow Templates gallery and the
 * Executions history list + execution detail surfaces.
 *
 * All API + Better Auth traffic is mocked. Execution navigation is asserted
 * against tenant-scoped run detail routes.
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
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.TEMPLATES), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automation\/templates$/);
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
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.TEMPLATES), {
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

  test('using a template creates a workflow and opens its editor', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.TEMPLATES), {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByText(testWorkflowTemplates[0].name).first(),
    ).toBeVisible();

    const useLink = authenticatedPage
      .getByRole('link', { name: 'Use Template', exact: true })
      .first();
    await expect(useLink).toHaveAttribute(
      'href',
      brandPath(
        `${APP_ROUTES.AUTOMATION.TEMPLATES}?template=${testWorkflowTemplates[0].id}`,
      ),
    );
    await useLink.click({ force: true });
    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(brandPath(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/workflow-new`));
    await expect(
      authenticatedPage.getByTestId('workflow-editor-section-actions'),
    ).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opening a template deep link creates a workflow and opens its editor', async ({
    authenticatedPage,
  }) => {
    const template = testWorkflowTemplates[0];

    await authenticatedPage.goto(
      brandPath(`/automation/templates?template=${template.id}`),
      { waitUntil: 'domcontentloaded' },
    );

    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(brandPath(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/workflow-new`));
    await expect(
      authenticatedPage.getByTestId('workflow-editor-section-actions'),
    ).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('executions history renders the runs table', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.RUNS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automation\/runs(?:\/)?$/);
    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution rows expose View Details deep links', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.RUNS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();

    const detailsLink = authenticatedPage
      .getByRole('link', { name: 'View Details', exact: true })
      .and(
        authenticatedPage.locator(`[href$="/${testWorkflowExecutions[0].id}"]`),
      );
    await expect(detailsLink).toBeVisible({ timeout: 10_000 });
    await expect(detailsLink).toHaveAttribute(
      'href',
      brandPath(
        `${APP_ROUTES.AUTOMATION.RUNS}/${testWorkflowExecutions[0].id}`,
      ),
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('executions list pagination controls are interactive', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.RUNS), {
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
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.RUNS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      executionsHistoryLocator(authenticatedPage).first(),
    ).toBeVisible();

    const detailsLink = authenticatedPage
      .getByRole('link', { name: 'View Details', exact: true })
      .and(
        authenticatedPage.locator(`[href$="/${testWorkflowExecutions[0].id}"]`),
      );
    await expect(detailsLink).toBeVisible();
    const destination = await detailsLink.getAttribute('href');
    expect(destination).toMatch(/\/automation\/runs\/[^/]+$/);
    await detailsLink.click();
    await expect
      .poll(() => new URL(authenticatedPage.url()).pathname)
      .toBe(destination);
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution detail route renders for a known execution id', async ({
    authenticatedPage,
  }) => {
    const execution = testWorkflowExecutions[0];

    await authenticatedPage.goto(
      brandPath(`/automation/runs/${execution.id}`),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`/automation/runs/${execution.id}$`),
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution detail route renders for the generic mock id', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      brandPath(`${APP_ROUTES.AUTOMATION.RUNS}/mock-id`),
      {
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(authenticatedPage).toHaveURL(/\/automation\/runs\/mock-id$/);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('empty templates state renders without errors', async ({
    authenticatedPage,
  }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.TEMPLATES), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automation\/templates/);
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('empty executions state renders without errors', async ({
    authenticatedPage,
  }) => {
    await mockWorkflowCrud(authenticatedPage, []);
    await mockWorkflowExecutions(authenticatedPage, []);
    await mockWorkflowTemplates(authenticatedPage, []);

    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.RUNS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automation\/runs(?:\/)?$/);
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
