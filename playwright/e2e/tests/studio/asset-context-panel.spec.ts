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

test.describe('Playground asset context panel', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await page.setViewportSize({ width: 1500, height: 950 });
    await page.route('**/cdn.genfeed.ai/mock/*.png', (route) =>
      route.fulfill({ body: pixel, contentType: 'image/png' }),
    );
    await page.route('**/v1/ingredients**', (route) => {
      const url = new URL(route.request().url());
      if (/\/(posts|children)$/.test(url.pathname)) {
        return route.fulfill({ json: { data: [] } });
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

  test('a failed generation offers Remove in the header and no preview', async ({
    authenticatedPage: page,
  }) => {
    await page.getByTestId('studio-asset-failed-video').click();

    const actions = page.getByTestId('context-sidebar-header-actions');
    await expect(
      actions.getByRole('button', { name: /^Remove/ }),
    ).toBeVisible();
    await expect(
      actions.getByRole('button', { name: 'Open preview' }),
    ).toHaveCount(0);
    await expect(page.getByTestId('studio-asset-failed-video')).toHaveClass(
      /gen-selected-card/,
    );
  });

  test('a finished asset puts Preview and the section menu in the header', async ({
    authenticatedPage: page,
  }) => {
    await page.getByTestId('studio-asset-ready-image').click();

    await expect(
      page
        .getByTestId('context-sidebar-header-actions')
        .getByRole('button', { name: 'Open preview' }),
    ).toBeVisible();
    const actions = page.getByTestId('context-sidebar-header-actions');
    await expect(page.getByRole('tab')).toHaveCount(0);
    await actions.getByRole('button', { name: 'View: Recipe' }).click();
    await expect(page.getByRole('menuitemradio')).toHaveText([
      'Recipe',
      'Used in',
      'History',
    ]);
  });
});
