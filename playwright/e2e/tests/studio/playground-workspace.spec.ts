import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1sAAAAASUVORK5CYII=',
  'base64',
);

function ingredient(
  id: string,
  category: 'IMAGE' | 'VIDEO',
  status: 'FAILED' | 'GENERATED',
) {
  return {
    id,
    type: 'ingredients',
    attributes: {
      brandId: 'brand-1',
      organizationId: 'mock-org-id-e2e-test',
      category,
      scope: 'USER',
      status,
      ...(status === 'GENERATED'
        ? { cdnUrl: `https://cdn.genfeed.ai/mock/${id}.png` }
        : {}),
      width: 1024,
      height: 768,
      createdAt: '2026-11-02T08:28:00Z',
      prompt: { original: `Prompt for ${id}` },
      metadata: { label: id, width: 1024, height: 768 },
    },
  };
}

/**
 * Playground uses the creative layout: the prompt (New) is on the left, the
 * generations are on the right, and an open generation lives at
 * /playground/:id with the same prompt still on the left.
 */
test.describe('Playground workspace', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.route('**/cdn.genfeed.ai/mock/*.png', (route) =>
      route.fulfill({ body: pixel, contentType: 'image/png' }),
    );
    await page.route('**/v1/studio-generate-drafts/current**', (route) =>
      route.fulfill({ json: { data: null } }),
    );
    await page.route('**/v1/ingredients**', (route) => {
      const url = new URL(route.request().url());
      if (/\/(posts|children)$/.test(url.pathname)) {
        return route.fulfill({ json: { data: [] } });
      }
      const id = url.pathname.split('/').at(-1);
      if (id === 'missing-generation') {
        return route.fulfill({ json: { errors: [] }, status: 404 });
      }
      if (id === 'ready-image' || id === 'failed-video') {
        return route.fulfill({
          json: {
            data:
              id === 'ready-image'
                ? ingredient(id, 'IMAGE', 'GENERATED')
                : ingredient(id, 'VIDEO', 'FAILED'),
          },
        });
      }
      return route.fulfill({
        json: {
          data: [
            ingredient('failed-video', 'VIDEO', 'FAILED'),
            ingredient('ready-image', 'IMAGE', 'GENERATED'),
          ],
          meta: { page: 1, pageSize: 100, totalCount: 2 },
        },
      });
    });
    await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
      waitUntil: 'domcontentloaded',
    });
  });

  test('puts the prompt on the left and the generations on the right', async ({
    authenticatedPage: page,
  }) => {
    const prompt = page.getByTestId('studio-playground-prompt');
    const card = page.getByTestId('studio-asset-ready-image');
    await expect(prompt).toBeVisible();
    await expect(card).toBeVisible();

    const promptBox = await prompt.boundingBox();
    const cardBox = await card.boundingBox();
    expect(promptBox?.x ?? 0).toBeLessThan(cardBox?.x ?? 0);
    await expect(
      page.getByRole('complementary', { name: 'Side panel' }),
    ).toHaveCount(0);
    await expectNoErrorOverlay(page);
  });

  test('opens a generation on its own URL and goes back to the list', async ({
    authenticatedPage: page,
  }) => {
    await page.getByTestId('studio-asset-ready-image').click();

    await expect(page).toHaveURL(/\/playground\/ready-image$/);
    await expect(page.getByTestId('studio-focused-preview')).toBeVisible();
    await expect(page.getByTestId('studio-playground-inspector')).toBeVisible();
    // The prompt stays on the left while a generation is open.
    await expect(page.getByTestId('studio-playground-prompt')).toBeVisible();
    await expect(
      page.getByRole('complementary', { name: 'Side panel' }),
    ).toHaveCount(0);

    await page
      .getByRole('button', { exact: true, name: 'Back to gallery' })
      .click();
    await expect(page).toHaveURL(/\/playground$/);
    await expect(page.getByTestId('studio-asset-ready-image')).toBeVisible();
  });

  test('opens a failed generation without a preview image', async ({
    authenticatedPage: page,
  }) => {
    await page.getByTestId('studio-asset-failed-video').click();

    await expect(page).toHaveURL(/\/playground\/failed-video$/);
    await expect(page.getByTestId('studio-focused-preview')).toBeVisible();
    await expect(page.getByTestId('studio-playground-prompt')).toBeVisible();
  });

  test('keeps a generation open across a reload', async ({
    authenticatedPage: page,
  }) => {
    await page.getByTestId('studio-asset-ready-image').click();
    await expect(page).toHaveURL(/\/playground\/ready-image$/);

    await page.reload({ waitUntil: 'domcontentloaded' });

    await expect(page.getByTestId('studio-focused-preview')).toBeVisible();
    await expect(page.getByTestId('studio-playground-inspector')).toBeVisible();
  });

  test('shows a way back when the generation is not in this workspace', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(
      brandPath(`${APP_ROUTES.STUDIO.PLAYGROUND}/missing-generation`),
      { waitUntil: 'domcontentloaded' },
    );

    await expect(
      page.getByText(
        'This asset is no longer available in the current workspace.',
      ),
    ).toBeVisible();
    await page
      .getByRole('button', { exact: true, name: 'Back to gallery' })
      .click();
    await expect(page).toHaveURL(/\/playground$/);
  });
});
