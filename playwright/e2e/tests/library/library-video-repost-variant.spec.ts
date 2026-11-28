import path from 'node:path';
import { brandPath } from '@e2e/utils/app-chrome';
import { IngredientCategory } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/**
 * Repost variant on a Library video card. The gallery and the variant
 * endpoint are mocked; the assertions cover what the creator sees: the
 * Transform menu offers Repost variant, the checklist opens next to the card
 * with mirror and speed picked, and one tap sends exactly the picked changes.
 *
 * @module library-video-repost-variant.spec
 */

const VIDEO_ID = 'library-video-repost-e2e';
const VIDEO_FIXTURE = path.join(
  process.cwd(),
  'playwright/e2e/fixtures/media/studio-clip.mp4',
);

function videoResource(): Record<string, unknown> {
  return {
    attributes: {
      brandId: 'brand-1',
      category: IngredientCategory.VIDEO,
      cdnUrl: `https://cdn.genfeed.ai/mock/${VIDEO_ID}.mp4`,
      createdAt: '2026-09-28T10:00:00.000Z',
      height: 1920,
      metadata: { model: 'kling-v3' },
      organizationId: 'mock-org-id-e2e-test',
      prompt: 'Slow dolly shot across a rain-soaked neon street',
      scope: 'USER',
      status: 'GENERATED',
      width: 1080,
    },
    id: VIDEO_ID,
    type: 'ingredients',
  };
}

async function mockLibrary(page: Page): Promise<{ bodies: unknown[] }> {
  const bodies: unknown[] = [];

  await page.route('**/cdn.genfeed.ai/mock/**', async (route: Route) => {
    await route.fulfill({ contentType: 'video/mp4', path: VIDEO_FIXTURE });
  });

  await page.route('**/v1/ingredients**', async (route: Route) => {
    const { pathname } = new URL(route.request().url());
    if (
      route.request().method() !== 'GET' ||
      /\/(summary|posts|children)$/.test(pathname)
    ) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      json: {
        data: [videoResource()],
        meta: { page: 1, pageSize: 100, totalCount: 1 },
      },
    });
  });

  await page.route(`**/v1/videos/${VIDEO_ID}/repost-variant`, async (route) => {
    bodies.push(route.request().postDataJSON());
    await route.fulfill({
      json: {
        data: { ...videoResource(), id: 'library-video-variant-e2e' },
      },
    });
  });

  return { bodies };
}

async function openTransformMenu(page: Page): Promise<Locator> {
  const tile = page.locator('[data-masonry-item]').first();
  await expect(tile).toBeVisible();
  // The action menu is keyboard-operable: focus reveals it, Enter opens it.
  await tile.getByRole('button', { name: 'More' }).focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();

  const trigger = menu.getByRole('menuitem', {
    exact: true,
    name: 'Transform',
  });
  await trigger.focus();
  await trigger.press('ArrowRight');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  const submenu = page.getByRole('menu', { exact: true, name: 'Transform' });
  await expect(submenu).toBeVisible();
  return submenu;
}

test.describe('Library video — Repost variant', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  });

  test('sends one request with only the picked changes', async ({
    authenticatedPage: page,
  }) => {
    const { bodies } = await mockLibrary(page);
    await page.goto(`${brandPath(APP_ROUTES.LIBRARY.VIDEOS)}?view=grid`, {
      waitUntil: 'domcontentloaded',
    });

    const transform = await openTransformMenu(page);
    await transform
      .getByRole('menuitem', { exact: true, name: 'Repost variant' })
      .click();

    const panel = page.getByRole('dialog', {
      exact: true,
      name: 'Repost variant',
    });
    await expect(panel).toBeVisible();
    // Mirror and speed start picked; nothing has been sent yet.
    await expect(panel.getByRole('checkbox', { name: /Mirror/ })).toBeChecked();
    await expect(
      panel.getByRole('checkbox', { name: /Speed 1\.1x/ }),
    ).toBeChecked();
    await expect(
      panel.getByRole('checkbox', { name: /Slight zoom/ }),
    ).not.toBeChecked();
    expect(bodies).toEqual([]);

    await panel
      .getByRole('checkbox', { name: /Cut the first 2 seconds/ })
      .click();
    await panel
      .getByRole('button', { name: 'Create variant · 3 changes' })
      .click();

    await expect
      .poll(() => bodies)
      .toEqual([{ isMirrored: true, speed: 1.1, trimStartSeconds: 2 }]);
    await expect(panel).toBeHidden();
    await expectNoErrorOverlay(page);
  });

  test('cannot create a variant with nothing picked', async ({
    authenticatedPage: page,
  }) => {
    const { bodies } = await mockLibrary(page);
    await page.goto(`${brandPath(APP_ROUTES.LIBRARY.VIDEOS)}?view=grid`, {
      waitUntil: 'domcontentloaded',
    });

    const transform = await openTransformMenu(page);
    await transform
      .getByRole('menuitem', { exact: true, name: 'Repost variant' })
      .click();

    const panel = page.getByRole('dialog', {
      exact: true,
      name: 'Repost variant',
    });
    await panel.getByRole('checkbox', { name: /Mirror/ }).click();
    await panel.getByRole('checkbox', { name: /Speed 1\.1x/ }).click();

    await expect(
      panel.getByRole('button', { name: /^Create variant/ }),
    ).toBeDisabled();
    expect(bodies).toEqual([]);
  });
});
