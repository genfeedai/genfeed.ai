import {
  APP_ROUTES,
  createBrandAppRoute,
  createOrganizationAppRoute,
} from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';

/**
 * Default mocked-auth workspace used by app-core fixtures.
 */
export const E2E_ORG_SLUG = 'test-org';
export const E2E_BRAND_SLUG = 'brand-1';
export const E2E_BRAND_BASE = `/${E2E_ORG_SLUG}/${E2E_BRAND_SLUG}`;

/**
 * Templates is a view of the Workflows page, not a route of its own
 * (`/automation/workflows?view=templates`).
 */
export const WORKFLOW_TEMPLATES_ROUTE = `${APP_ROUTES.AUTOMATION.WORKFLOWS}?view=templates`;

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
