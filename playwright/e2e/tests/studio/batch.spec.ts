import { BatchProjectKind } from '@genfeedai/contracts';
import { playwrightApiEndpoint } from '../../config/environment';
import { expect, test } from '../../fixtures/auth.fixture';
import { mockBatchProject } from '../../fixtures/batch-projects.fixture';

const base = '/test-org/brand-1/studio/batch';
test.describe('Persisted Batch projects', () => {
  test('idea choices, generated ideas, quote, approval and per-target timing survive reloads', async ({
    authenticatedPage: page,
  }) => {
    const state = await mockBatchProject(page, BatchProjectKind.IDEAS);
    await page.goto(`${base}/persisted-batch`);
    await page
      .getByRole('textbox', { name: 'Creative angle' })
      .fill('Launch week');
    await expect
      .poll(() => state.getProject().settings.ideas?.angle)
      .toBe('Launch week');
    await page.reload();
    await expect(
      page.getByRole('textbox', { name: 'Creative angle' }),
    ).toHaveValue('Launch week');
    await page
      .getByRole('button', { name: 'Generate ideas', exact: true })
      .click();
    await expect(page.getByText('Launch idea', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText('Launch idea', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Review generation cost' }).click();
    await expect(
      page.getByRole('button', { name: 'Accept quote and generate' }),
    ).toBeVisible();
    await page.reload();
    await page
      .getByRole('button', { name: 'Accept quote and generate' })
      .click();
    await expect(
      page.getByRole('button', { name: 'Approve', exact: true }),
    ).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await page.getByRole('button', { name: 'Schedule', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Batch Instagram' }).check();
    await page
      .getByLabel('Publish time for Batch Instagram')
      .fill('2030-10-01T12:30');
    await expect
      .poll(
        () => state.getProject().settings.schedule?.targets[0]?.scheduledDate,
      )
      .toBeTruthy();
    await page.reload();
    await expect(
      page.getByRole('checkbox', { name: 'Batch Instagram' }),
    ).toBeChecked();
    await expect(
      page.getByLabel('Publish time for Batch Instagram'),
    ).toHaveValue('2030-10-01T12:30');
    await page.getByRole('button', { name: 'Schedule approved items' }).click();
    await expect.poll(() => state.scheduled.length).toBe(1);
    expect(state.scheduled[0].targets[0]).toMatchObject({
      credentialId: 'batch-instagram',
      scheduledDate: expect.any(String),
    });
    await page.reload();
    await expect(
      page.getByText('Scheduled', { exact: true }).first(),
    ).toBeVisible();
  });

  test('workflow video input survives reload and its output reaches the shared review inbox', async ({
    authenticatedPage: page,
  }) => {
    const state = await mockBatchProject(page, BatchProjectKind.WORKFLOW, {
      deferGeneration: true,
    });
    await page.goto(`${base}/persisted-batch`);
    await page.getByLabel('Add images or videos').setInputFiles({
      name: 'input.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('mock-upload'),
    });
    await expect
      .poll(() => state.getProject().items?.[0]?.inputIngredientId)
      .toBe('video-input');
    await page.reload();
    await expect(page.getByText('video-input', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Start workflow batch' }).click();
    await expect(
      page.getByText('Generating', { exact: true }).first(),
    ).toBeVisible();
    await page.goto(base);
    state.completeGeneration();
    await page.goto(`${base}/persisted-batch`);
    await expect(
      page.getByRole('link', { name: 'Open review inbox' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Approve', exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Open review inbox' }).click();
    await expect(page).toHaveURL(/publishing\/review/);
    await expect(
      page.getByText('Saved batch output', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText('batch-project-item:item-1', { exact: true }),
    ).toBeVisible();
  });

  test('creates a saved idea project and reopens it from list and grid on mobile', async ({
    authenticatedPage: page,
  }, testInfo) => {
    const state = await mockBatchProject(page, BatchProjectKind.IDEAS);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/new`);
    await page
      .getByRole('button', { name: 'Generate ideas', exact: true })
      .first()
      .click();
    await page
      .getByRole('textbox', { name: 'Batch name' })
      .fill('Launch collection');
    await page
      .getByRole('button', { name: 'Create batch', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`${base}/persisted-batch`));
    await expect(page.getByRole('textbox', { name: 'Batch name' })).toHaveValue(
      'Launch collection',
    );
    expect(state.getProject().name).toBe('Launch collection');
    await page.screenshot({
      path: testInfo.outputPath('batch-detail-mobile.png'),
      fullPage: true,
    });
    await page.getByRole('link', { name: 'All batches', exact: true }).click();
    await expect(
      page.getByText('Launch collection', { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole('radio', { name: 'Grid', exact: true }).click();
    await expect(
      page.getByRole('radio', { name: 'Grid', exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: testInfo.outputPath('batch-list-mobile.png'),
      fullPage: true,
    });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    await page.getByRole('link', { name: 'Open', exact: true }).first().click();
    await expect(page.getByRole('textbox', { name: 'Batch name' })).toHaveValue(
      'Launch collection',
    );
  });

  test('invalid files and permanent upload errors do not block later valid uploads or saves', async ({
    authenticatedPage: page,
  }) => {
    const state = await mockBatchProject(page, BatchProjectKind.WORKFLOW);
    const statuses = [413, 422];
    await page.route(
      `${playwrightApiEndpoint}/videos/upload`,
      async (route) => {
        const status = statuses.shift();
        if (!status) return route.fallback();
        await route.fulfill({
          status,
          json: {
            errors: [
              { status: String(status), detail: 'Upload rejected permanently' },
            ],
          },
        });
      },
    );
    await page.goto(`${base}/persisted-batch`);
    const input = page.getByLabel('Add images or videos');
    await input.setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('invalid'),
    });
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: 'Choose an image or video file.' }),
    ).toBeVisible();
    expect(statuses).toEqual([413, 422]);
    for (const name of ['oversized.mp4', 'invalid-content.mp4']) {
      await input.setInputFiles({
        name,
        mimeType: 'video/mp4',
        buffer: Buffer.from('invalid'),
      });
      await expect(
        page
          .getByRole('alert')
          .filter({ hasText: 'Upload rejected permanently' }),
      ).toBeVisible();
      await expect(input).toBeEnabled();
      await expect(
        page.getByRole('dialog', { name: 'Request failed', exact: true }),
      ).toHaveCount(0);
      await page
        .getByRole('textbox', { name: 'Batch name' })
        .fill(`Saved after ${name}`);
      await expect
        .poll(() => state.getProject().name)
        .toBe(`Saved after ${name}`);
    }
    await input.setInputFiles({
      name: 'valid.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('valid'),
    });
    await expect
      .poll(() => state.getProject().items?.[0]?.inputIngredientId)
      .toBe('video-input');
    await expect(
      page.getByRole('button', { name: 'Start workflow batch' }),
    ).toBeEnabled();
  });

  test('new batch offers ideas and workflow creation when there are no saved workflows', async ({
    authenticatedPage: page,
  }) => {
    await mockBatchProject(page, BatchProjectKind.IDEAS);
    await page.route('**/workflows?**', (route) =>
      route.fulfill({ json: { data: [] } }),
    );
    await page.goto(`${base}/new`);
    await page
      .getByRole('button', { name: 'Saved workflow', exact: true })
      .click();
    await expect(
      page.getByText('No saved workflows yet.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Create a workflow' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate ideas', exact: true }).first(),
    ).toBeEnabled();
  });
});
