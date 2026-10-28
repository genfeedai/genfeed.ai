import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockBrandsData,
  mockModelCatalog,
  mockNodeTypes,
  mockPromptHistory,
  mockWorkflowCrud,
  mockWorkflowExecutions,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  testNodeTypes,
  testWorkflowExecutions,
  testWorkflows,
} from '../../fixtures/test-data.fixture';
import { brandPath } from '../../utils/app-chrome';

/**
 * The workflow editor's model and prompt pickers. Every product step is a
 * `genfeedAction` node, so the pickers live in its inspector: the model field
 * opens the catalog browser, and the prompt field offers earlier prompts.
 */
test.describe('Workflow editor pickers', () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockWorkflowCrud(authenticatedPage, testWorkflows);
    await mockWorkflowExecutions(authenticatedPage, testWorkflowExecutions);
    await mockNodeTypes(authenticatedPage, testNodeTypes);
    await mockBrandsData(authenticatedPage, 3);
    await mockModelCatalog(authenticatedPage, [
      {
        category: 'image',
        description: 'Editorial and product',
        id: 'model-flux',
        key: 'black-forest-labs/flux-2-pro',
        label: 'Flux 2 Pro',
        qualityTier: 'high',
      },
      {
        category: 'image',
        description: 'Photoreal, text in image',
        id: 'model-banana',
        key: 'google/nano-banana-pro',
        label: 'Nano Banana Pro',
        qualityTier: 'ultra',
      },
    ]);
    await mockPromptHistory(authenticatedPage, [
      { id: 'prompt-1', original: 'A neon alley at night' },
      { id: 'prompt-2', original: 'Studio product shot on marble' },
    ]);

    await authenticatedPage.goto(
      brandPath(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/${testWorkflows[0].id}`),
      { waitUntil: 'domcontentloaded' },
    );
    await authenticatedPage
      .locator('.react-flow__node', { hasText: 'Generate Image' })
      .first()
      .click();
  });

  test('picks an image model from the catalog without exposing providers', async ({
    authenticatedPage,
  }) => {
    const inspector = authenticatedPage.getByRole('complementary', {
      name: 'Generate Image configuration',
    });
    await inspector.getByRole('button', { name: /^Model/ }).click();

    const dialog = authenticatedPage.getByRole('dialog', {
      name: 'Choose a model',
    });
    await expect(dialog.getByText('Nano Banana Pro')).toBeVisible();
    await expect(dialog.getByText(/replicate|openrouter|\.env/i)).toHaveCount(
      0,
    );

    await dialog.getByRole('button', { name: /Flux 2 Pro/ }).click();

    await expect(dialog).toBeHidden();
    await expect(
      inspector.getByRole('button', { name: /^Model/ }),
    ).toContainText('Flux 2 Pro');
  });

  test('fills the prompt from an earlier prompt', async ({
    authenticatedPage,
  }) => {
    const inspector = authenticatedPage.getByRole('complementary', {
      name: 'Generate Image configuration',
    });
    await inspector
      .getByRole('button', { name: 'Use a recent prompt' })
      .click();

    const dialog = authenticatedPage.getByRole('dialog', {
      name: 'Recent prompts',
    });
    await dialog.getByRole('button', { name: 'A neon alley at night' }).click();

    await expect(dialog).toBeHidden();
    await expect(inspector.getByLabel('Prompt')).toHaveValue(
      'A neon alley at night',
    );
  });
});
