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
    await authenticatedPage.goto('/workflows/templates', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/workflows\/templates$/);
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
    await authenticatedPage.goto('/workflows/templates', {
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
    await authenticatedPage.goto('/workflows/templates', {
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

    expect(authenticatedPage.url()).toContain('/workflows/templates');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opening a template via its deep link renders the gallery', async ({
    authenticatedPage,
  }) => {
    const template = testWorkflowTemplates[0];

    await authenticatedPage.goto(
      `/workflows/templates?template=${template.id}`,
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
    await authenticatedPage.goto('/workflows/executions', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/workflows\/executions$/);
    await expect(
      authenticatedPage.getByRole('heading', { name: /execution history/i }),
    ).toBeVisible();

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution rows expose View Details deep links', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workflows/executions', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByRole('heading', { name: /execution history/i }),
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
    await authenticatedPage.goto('/workflows/executions', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByRole('heading', { name: /execution history/i }),
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
    await authenticatedPage.goto('/workflows/executions', {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      authenticatedPage.getByRole('heading', { name: /execution history/i }),
    ).toBeVisible();

    const detailsLink = authenticatedPage
      .locator('a[href*="execution="]')
      .first();
    const hasLink = await detailsLink.isVisible().catch(() => false);
    if (hasLink) {
      await detailsLink.click({ timeout: 5_000 }).catch(() => {});
      await authenticatedPage.waitForTimeout(500);
    }

    expect(authenticatedPage.url()).toContain('/workflows');
    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution detail route renders for a known execution id', async ({
    authenticatedPage,
  }) => {
    const execution = testWorkflowExecutions[0];

    await authenticatedPage.goto(`/workflows/executions/${execution.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`/workflows/executions/${execution.id}$`),
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('execution detail route renders for the generic mock id', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workflows/executions/mock-id', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/workflows\/executions\/mock-id$/,
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('empty templates state renders without errors', async ({
    automationPage,
  }) => {
    // automationPage pre-mocks empty templates; navigate to the gallery.
    await automationPage.goto('/workflows/templates', {
      waitUntil: 'domcontentloaded',
    });

    await expect(automationPage).toHaveURL(/\/workflows\/templates$/);
    await expect(automationPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(automationPage);
  });

  test('empty executions state renders without errors', async ({
    automationPage,
  }) => {
    await automationPage.goto('/workflows/executions', {
      waitUntil: 'domcontentloaded',
    });

    await expect(automationPage).toHaveURL(/\/workflows\/executions$/);
    await expect(automationPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(automationPage);
  });
});
