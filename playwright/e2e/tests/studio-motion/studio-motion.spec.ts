import { playwrightApiEndpoint } from '../../config/environment';
import { expect, test } from '../../fixtures/auth.fixture';

const settings = { width: 640, height: 360, fps: 30, durationFrames: 30 };
const quote = {
  unit: 'credits',
  modelKey: 'test-model',
  isByok: false,
  authoringCredits: 1,
  inspectionCredits: 1,
  renderCredits: 1,
  maximumCredits: 3,
  settings,
  outputRequests: [{ format: 'mp4' }],
  maximumAuthoringCalls: 3,
  maximumInspectionCalls: 3,
  maximumRepairs: 2,
  maximumRenderJobs: 4,
  renderDeadlineSeconds: 120,
  rendererVersion: '4.0.530',
  creditsPerSecond: 0.01,
};

test('Motion reviews exact output cost and retains source on a revision conflict', async ({
  authenticatedPage: page,
}) => {
  let submitted = 0;
  await page.route(
    `${playwrightApiEndpoint}/visual-projects/**`,
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/catalog'))
        return route.fulfill({
          json: {
            data: {
              type: 'visual-code-catalog',
              id: 'catalog',
              attributes: {
                isAvailable: true,
                defaultModelKey: 'test-model',
                models: [
                  {
                    key: 'test-model',
                    label: 'Test model',
                    isAvailable: true,
                    inspectionCapability: 'unknown',
                  },
                ],
                defaultSettings: settings,
              },
            },
          },
        });
      if (path.endsWith('/quote'))
        return route.fulfill({
          json: {
            data: { type: 'visual-code-quote', id: 'quote', attributes: quote },
          },
        });
      if (route.request().method() === 'POST') {
        submitted++;
        return route.fulfill({
          status: 409,
          json: { message: 'stale_visual_revision' },
        });
      }
      return route.fulfill({
        json: { data: [], links: { cursor: { nextCursor: null } } },
      });
    },
  );
  await page.goto('/test-org/brand-1/studio/motion');
  await page
    .getByLabel('Project name', { exact: true })
    .fill('Motion acceptance');
  await page
    .getByRole('textbox', { name: 'Prompt', exact: true })
    .fill('Animate a title');
  await page
    .getByRole('button', { name: 'Review generation quote', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Confirm and start' }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Vision support for this model is unverified/).first(),
  ).toBeVisible();
  await page
    .getByRole('checkbox', {
      name: 'I approve up to 3 credits for this request.',
    })
    .check();
  await page.getByRole('button', { name: 'Confirm and start' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Request failed' }),
  ).toBeVisible();
  await page
    .getByRole('dialog', { name: 'Request failed' })
    .getByRole('button', { name: 'Close', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Prompt', exact: true }),
  ).toHaveValue('Animate a title');
  expect(submitted).toBe(1);
  await page
    .getByRole('textbox', { name: 'Prompt', exact: true })
    .fill('A changed title');
  await expect(
    page.getByRole('button', { name: 'Confirm and start' }),
  ).toHaveCount(0);
});
