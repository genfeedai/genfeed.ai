import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Default mocked-auth workspace used by app-core fixtures.
 */
export const E2E_ORG_SLUG = 'test-org';
export const E2E_BRAND_SLUG = 'brand-1';
export const E2E_BRAND_BASE = `/${E2E_ORG_SLUG}/${E2E_BRAND_SLUG}`;

/**
 * Templates is a view of the Workflows page, not a route of its own
 * (`/automation/workflows/templates`).
 */
export const WORKFLOW_TEMPLATES_ROUTE =
  APP_ROUTES.AUTOMATION.WORKFLOWS_TEMPLATES;

export function brandPath(path: string = APP_ROUTES.ROOT): string {
  return createBrandAppRoute(E2E_ORG_SLUG, E2E_BRAND_SLUG, path);
}

/**
 * Current app route as path + query. Library places and asset types are query
 * filters on `/library/assets` (#5135), so the pathname alone cannot tell
 * them apart.
 */
export function currentRoute(page: Page): string {
  const { pathname, search } = new URL(page.url());
  return `${pathname}${search}`;
}

export function orgPath(path: string = APP_ROUTES.ROOT): string {
  return createOrganizationAppRoute(E2E_ORG_SLUG, path);
}

export function orgSettingsRoute(path: string): string {
  return createOrganizationAppRoute(E2E_ORG_SLUG, path);
}

/**
 * Current sidebar chrome. Legacy `[data-testid="sidebar"]` / bare `aside`
 * locators match multiple landmarks and trip Playwright strict mode.
 */
export function sidebarLocator(page: Page): Locator {
  return page
    .getByTestId('sidebar-shell')
    .or(page.locator('[data-testid="sidebar"]'))
    .first();
}

const PHONE_MAX_WIDTH = 768;

function isPhoneViewport(page: Page): boolean {
  return (page.viewportSize()?.width ?? Infinity) < PHONE_MAX_WIDTH;
}

/**
 * Where the account menu lives. Wide viewports render the app rail in the
 * shell; phone widths hide it and show the same rail inside the mobile
 * navigation drawer, which the topbar toggle opens. The drawer must be
 * visible before its account menu is used.
 */
async function openAccountSurface(page: Page): Promise<Locator> {
  if (!isPhoneViewport(page)) {
    return page.getByTestId('app-rail-account');
  }

  await page.getByRole('button', { name: 'Open navigation menu' }).click();
  const drawerRail = page.getByTestId('mobile-app-rail');
  await expect(drawerRail).toBeVisible();
  return drawerRail.getByTestId('app-rail-account');
}

/**
 * Opens the account menu (through the mobile navigation drawer on phone
 * widths) and returns its credit wallet block. The balance is not shown in
 * the topbar; it lives here.
 */
export async function openAccountCredits(page: Page): Promise<Locator> {
  const account = await openAccountSurface(page);
  await account.getByRole('button', { name: 'Open account menu' }).click();
  await expect(page.getByRole('menu')).toBeVisible();
  return page.getByTestId('account-credits');
}

/**
 * Asserts the account menu shows no credit wallet block, then closes it. The
 * menu is always opened first (via the mobile drawer on phone widths), so a
 * missing rail, drawer or account button fails instead of passing vacuously.
 */
export async function expectNoAccountCredits(page: Page): Promise<void> {
  const credits = await openAccountCredits(page);
  await expect(credits).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);

  if (isPhoneViewport(page)) {
    await page.getByRole('button', { name: 'Close navigation menu' }).click();
    await expect(page.getByTestId('mobile-app-rail')).toHaveCount(0);
  }
}
