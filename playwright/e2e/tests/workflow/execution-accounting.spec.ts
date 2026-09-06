import {
  buildExecutionJsonApiResource,
  mockActiveSubscription,
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
import { WorkflowPage } from '../../pages/workflow.page';

test.describe('Workflow accounting display', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, testWorkflows);
    await mockWorkflowExecutions(authenticatedPage, testWorkflowExecutions);
    await mockWorkflowTemplates(authenticatedPage, testWorkflowTemplates);
    await mockNodeTypes(authenticatedPage, testNodeTypes);
  });
  for (const actualCredits of [0.27, 0, null]) {
    test(`shows ${actualCredits === null ? 'unavailable with known subtotal' : `net cost ${actualCredits} and refund`}`, async ({
      authenticatedPage,
    }, testInfo) => {
      const accounting = {
        estimate: null,
        estimatedCredits: 0.3,
        actualCredits,
        knownActualCredits: actualCredits === 0 ? 0 : 0.27,
        varianceCredits:
          actualCredits === null ? null : actualCredits === 0 ? -0.3 : -0.03,
        actualProviderCostMicros: actualCredits === null ? null : 125000,
        knownProviderCostMicros: 125000,
        nodes: [
          {
            nodeId: 'image',
            providerBreakdown: [
              {
                model: 'example-model',
                provider: 'replicate',
                actualProviderCostMicros:
                  actualCredits === null ? null : 125000,
                knownProviderCostMicros: 125000,
              },
            ],
            model: 'example-model',
            provider: 'replicate',
            estimatedCredits: 0.3,
            actualCredits,
            knownActualCredits: actualCredits === 0 ? 0 : 0.27,
            varianceCredits:
              actualCredits === null
                ? null
                : actualCredits === 0
                  ? -0.3
                  : -0.03,
            refundedCredits: 0.03,
            reservedCredits: 0,
            state: actualCredits === null ? 'indeterminate' : 'refunded',
            actualProviderCostMicros: actualCredits === null ? null : 125000,
            knownProviderCostMicros: 125000,
            unresolvedReasons: [],
          },
        ],
      };
      await authenticatedPage.route(
        '**/workflow-executions/exec-accounting',
        (route) =>
          route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              data: buildExecutionJsonApiResource('exec-accounting', {
                workflowId: testWorkflows[0].id,
                status: 'completed',
                createdAt: '2026-09-05T09:00:00Z',
                startedAt: '2026-09-05T09:00:00Z',
                completedAt: '2026-09-05T09:00:10Z',
                accounting,
                nodeResults: [
                  {
                    nodeId: 'image',
                    nodeType: 'imageGen',
                    status: 'completed',
                    startedAt: '2026-09-05T09:00:00Z',
                  },
                ],
              }),
            }),
          }),
      );
      await new WorkflowPage(authenticatedPage).gotoExecutionById(
        'exec-accounting',
      );
      await expect(
        authenticatedPage.getByText('Actual credits', { exact: true }),
      ).toBeVisible();
      if (actualCredits === null)
        await expect(
          authenticatedPage.getByText('Known subtotal: 0.27'),
        ).toBeVisible();
      else
        await expect(
          authenticatedPage.getByText(
            actualCredits === 0 ? 'Variance: -0.3' : 'Variance: -0.03',
          ),
        ).toBeVisible();
      if (actualCredits !== null)
        await expect(
          authenticatedPage.getByText('Provider cost (USD): $0.125000', {
            exact: true,
          }),
        ).toBeVisible();
      await authenticatedPage.getByRole('button', { name: /imageGen/ }).click();
      await expect(
        authenticatedPage.getByText(
          actualCredits === null
            ? 'replicate / example-model: Unavailable'
            : 'replicate / example-model: $0.125000',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText(
          'Model: example-model · Provider: replicate',
        ),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText(
          'Refunded credits: 0.03 · Reserved credits: 0',
        ),
      ).toBeVisible();
      await authenticatedPage.screenshot({
        path: testInfo.outputPath('accounting-desktop.png'),
        fullPage: true,
      });
      await authenticatedPage.setViewportSize({ width: 390, height: 844 });
      await authenticatedPage.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await authenticatedPage
        .getByText('Actual credits', { exact: true })
        .scrollIntoViewIfNeeded();
      await authenticatedPage.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
      await expect(
        authenticatedPage.getByText('Actual credits', { exact: true }),
      ).toBeVisible();
      await authenticatedPage.screenshot({
        path: testInfo.outputPath('accounting.png'),
        fullPage: true,
      });
    });
  }
});
