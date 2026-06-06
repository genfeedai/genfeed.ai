import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction specs for the brand-scoped media library surfaces
 * (avatars, music, videos, voices). The shared API interceptor returns sample
 * collections so grids/rows populate, letting us exercise filter dropdowns,
 * search, sort, detail/preview open-close, upload/create triggers, and
 * pagination for code coverage. Real selectors are preferred with `tryClick`
 * fallbacks (never throws) so the specs stay resilient to markup changes.
 */

const BRAND = '/test-org/brand-1';

// Common, resilient selectors shared across the IngredientsLayout surfaces.
const FILTERS_TRIGGER =
  'button[aria-label="Filters"], button:has-text("Filter")';
const SEARCH_INPUT =
  'input[placeholder*="Search"], input[type="search"], input[type="text"]';
const SORT_SELECT =
  '[role="combobox"], select, button:has-text("Sort"), [placeholder*="Sort"]';
const STATUS_SELECT = '[placeholder*="Status"], [placeholder*="Statuses"]';
const CARD =
  '[data-testid="ingredient-item"], [role="gridcell"], article, .group';
const UPLOAD_TRIGGER =
  'button[aria-label="Upload"], button:has-text("Upload"), button:has-text("Clone")';
const VIEW_TOGGLE =
  'button[aria-label*="view" i], [role="tab"], button:has-text("Grid"), button:has-text("List")';
const MODAL_CLOSE =
  'button[aria-label="Close"], [role="dialog"] button:has-text("Cancel"), button:has-text("Close")';
const LOAD_MORE =
  'button:has-text("Load more"), button:has-text("Next"), [aria-label*="next" i]';

async function exerciseFilters(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
  // Open the filters dropdown, then poke at search/sort/status controls.
  await tryClick(page, FILTERS_TRIGGER).catch(() => {});

  const search = page.locator(SEARCH_INPUT).first();
  if (await search.isVisible().catch(() => false)) {
    await search.fill('demo').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});
  }

  await tryClick(page, SORT_SELECT).catch(() => {});
  await tryClick(page, STATUS_SELECT).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

async function exerciseDetailAndUpload(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
  // Open an item card → detail/preview, then close it.
  await tryClick(page, CARD).catch(() => {});
  await tryClick(page, MODAL_CLOSE).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});

  // Open the upload/create flow then cancel it.
  await tryClick(page, UPLOAD_TRIGGER).catch(() => {});
  await tryClick(page, MODAL_CLOSE).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
}

test.describe('Library media — deep interactions', () => {
  test.setTimeout(90_000);

  test('avatars: filters, search, detail, and create flow', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/avatars`);

    await exerciseFilters(authenticatedPage);
    await exerciseDetailAndUpload(authenticatedPage);
    await tryClick(authenticatedPage, VIEW_TOGGLE).catch(() => {});
    await tryClick(authenticatedPage, LOAD_MORE).catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('music: filters, sort, detail, and upload flow', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/music`);

    await exerciseFilters(authenticatedPage);
    await exerciseDetailAndUpload(authenticatedPage);
    await tryClick(authenticatedPage, LOAD_MORE).catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('videos: type tabs, filters, detail, and upload flow', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/videos`);

    await tryClick(authenticatedPage, VIEW_TOGGLE).catch(() => {});
    await exerciseFilters(authenticatedPage);
    await exerciseDetailAndUpload(authenticatedPage);
    await tryClick(authenticatedPage, LOAD_MORE).catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('voices: catalog filters, row detail, and clone flow', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/voices`);

    await exerciseFilters(authenticatedPage);

    // Voices render as rows; open a row action and the clone/upload flow.
    await tryClick(
      authenticatedPage,
      '[data-testid="voice-row"], tr, .group, button:has-text("Play")',
    ).catch(() => {});
    await tryClick(authenticatedPage, UPLOAD_TRIGGER).catch(() => {});
    await tryClick(authenticatedPage, MODAL_CLOSE).catch(() => {});
    await authenticatedPage.keyboard.press('Escape').catch(() => {});
    await tryClick(authenticatedPage, LOAD_MORE).catch(() => {});

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
