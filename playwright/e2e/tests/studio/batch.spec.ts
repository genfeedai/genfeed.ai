import { BatchProjectKind } from '@genfeedai/contracts';
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
    const state = await mockBatchProject(page, BatchProjectKind.WORKFLOW);
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
  });

  test('new batch offers ideas and workflow creation when there are no saved workflows', async ({
    authenticatedPage: page,
  }) => {
    await mockBatchProject(page, BatchProjectKind.IDEAS);
    await page.route('**/workflows?**', (route) =>
      route.fulfill({ json: { data: [] } }),
    );
    await page.goto(`${base}/new`);
    await expect(
      page.getByText('No saved workflows yet.', { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Create a workflow' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'From ideas', exact: true }).first(),
    ).toBeEnabled();
  });
});
