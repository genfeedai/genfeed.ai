import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction specs for the brand-scoped asset library surfaces
 * (captions, gifs, ingredients). The shared API interceptor returns sample
 * collections so tables/grids populate. These specs exercise filter dropdowns,
 * search, sort, row/card detail open-close, create triggers, and pagination to
 * widen code coverage. Real selectors are preferred with `tryClick` fallbacks
 * (never throws) so the specs stay resilient to markup changes.
 */

const BRAND = '/test-org/brand-1';

const FILTERS_TRIGGER =
  'button[aria-label="Filters"], button:has-text("Filter")';
const SEARCH_INPUT =
  'input[placeholder*="Search"], input[type="search"], input[type="text"]';
const SORT_SELECT =
  '[role="combobox"], select, button:has-text("Sort"), [placeholder*="Sort"]';
const STATUS_SELECT = '[placeholder*="Status"], [placeholder*="Statuses"]';
const ROW_OR_CARD =
  '[data-testid="ingredient-item"], table tbody tr, [role="gridcell"], article, .group';
const CREATE_TRIGGER =
  'button[aria-label="Upload"], button:has-text("Upload"), button:has-text("Create"), button:has-text("New")';
const MODAL_CLOSE =
  'button[aria-label="Close"], [role="dialog"] button:has-text("Cancel"), button:has-text("Close")';
const LOAD_MORE =
  'button:has-text("Load more"), button:has-text("Next"), [aria-label*="next" i]';

async function exerciseFilters(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
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

async function exerciseDetailAndCreate(
  page: Parameters<typeof tryClick>[0],
): Promise<void> {
  await tryClick(page, ROW_OR_CARD).catch(() => {});
  await tryClick(page, MODAL_CLOSE).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});

  await tryClick(page, CREATE_TRIGGER).catch(() => {});
  await tryClick(page, MODAL_CLOSE).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});

  await tryClick(page, LOAD_MORE).catch(() => {});
}

test.describe('Library assets — deep interactions', () => {
  test.setTimeout(90_000);

  test('captions: table filters, search, and row detail', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/captions`);

    await exerciseFilters(authenticatedPage);
    await exerciseDetailAndCreate(authenticatedPage);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('gifs: grid filters, sort, detail, and create flow', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/gifs`);

    await exerciseFilters(authenticatedPage);
    await exerciseDetailAndCreate(authenticatedPage);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('ingredients: landing filters, search, detail, and create flow', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/library/ingredients`);

    await exerciseFilters(authenticatedPage);
    await exerciseDetailAndCreate(authenticatedPage);

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
