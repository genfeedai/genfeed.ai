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

test.describe('Workflows', () => {
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

  test('workflow detail renders restored editor chrome for an existing workflow', async ({
    authenticatedPage,
  }) => {
    const workflow = testWorkflows[1];

    await authenticatedPage.goto(`/workflows/${workflow.id}`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`/workflows/${workflow.id}$`),
    );
    await expect(
      authenticatedPage.locator('a[href="/workflows"]').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: workflow.name }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Publish' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Archive' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/Typical run|Usually/i).first(),
    ).toBeVisible();
  });

  test('workflow creation route renders restored navigation and draft actions', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workflows/new', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/workflows\/new$/);
    await expect(
      authenticatedPage.locator('a[href="/workflows"]').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Untitled Workflow' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Publish' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Archive' }),
    ).toBeVisible();
  });

  test('workflow executions route renders execution history shell', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/workflows/executions', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/workflows\/executions$/);
    await expect(
      authenticatedPage.getByRole('heading', { name: /execution history/i }),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected away from workflow editor routes', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/workflows/new', {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });

  test('unauthenticated user is redirected away from workflow executions', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/workflows/executions', {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
