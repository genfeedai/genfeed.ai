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

export function brandPath(path: string = APP_ROUTES.ROOT): string {
  return createBrandAppRoute(E2E_ORG_SLUG, E2E_BRAND_SLUG, path);
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
