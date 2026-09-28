import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';
import { orgSettingsRoute } from '../utils/app-chrome';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
} from '../utils/route-assertions';

/**
 * Page Object Model for the Settings surfaces.
 *
 * Settings navigation is the shared app sidebar (settings-menu-items.config.ts),
 * not an in-page tab bar, and page content renders inside the workspace
 * canvas region. Every navigation helper here asserts the destination
 * rendered without an HTTP error, framework overlay or ErrorBoundary fallback.
 *
 * @module settings.page
 */
export class SettingsPage {
  readonly page: Page;
  readonly url = APP_ROUTES.SETTINGS.ROOT;

  // Layout
  readonly canvas: Locator;
  readonly settingsNav: Locator;

  // Personal settings (settings-profile-page.tsx)
  readonly profileSection: Locator;
  readonly localeTrigger: Locator;
  readonly appearanceTrigger: Locator;
  readonly agentModeTrigger: Locator;
  readonly accountMenuAvatar: Locator;

  // API keys (organization/api-keys/content.tsx)
  readonly generateApiKeyButton: Locator;

  // Organization identity defaults
  readonly orgIdentityCard: Locator;
  readonly orgDefaultAvatarTrigger: Locator;
  readonly saveOrgIdentityButton: Locator;
  readonly browseAvatarLibraryButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.canvas = page.getByRole('region', {
      name: 'Primary workspace canvas',
    });
    // The same sidebar tree is mounted twice (desktop rail + pre-mounted
    // mobile drawer, see AppLayout.tsx); only DesktopSidebar renders the
    // `aria-label="Navigation"` landmark, so scoping to it avoids strict-mode
    // duplicates.
    this.settingsNav = page.getByRole('complementary', {
      exact: true,
      name: 'Navigation',
    });

    this.profileSection = this.canvas.getByRole('heading', {
      name: 'Profile Information',
    });
    this.localeTrigger = page.getByTestId('personal-locale-trigger');
    this.appearanceTrigger = page.getByTestId('personal-appearance-trigger');
    this.agentModeTrigger = page.getByTestId('personal-agent-mode-trigger');
    // The user's avatar renders in the sidebar account menu
    // (SidebarUserProfile), not on the settings page.
    this.accountMenuAvatar = this.settingsNav
      .getByRole('button', { name: 'Open account menu' })
      .locator('img');

    this.generateApiKeyButton = this.canvas.getByRole('button', {
      name: 'Create Key',
    });

    this.orgIdentityCard = page.getByTestId('org-identity-defaults-card');
    this.orgDefaultAvatarTrigger = page.getByTestId(
      'org-default-avatar-trigger',
    );
    this.saveOrgIdentityButton = page.getByTestId('save-org-identity');
    this.browseAvatarLibraryButton = page.getByTestId('browse-avatar-library');
  }

  /**
   * Navigate to a settings route and assert it rendered cleanly.
   */
  async open(route: string): Promise<void> {
    await assertRouteRenders(this.page, route, { timeout: 60000 });
  }

  /**
   * Bare `/settings` redirects to Personal, the settings home.
   */
  async goto(): Promise<void> {
    await this.open(this.url);
    await expect(this.page).toHaveURL(
      new RegExp(`${APP_ROUTES.SETTINGS.PERSONAL}$`),
    );
  }

  // Organization-scoped routes use the explicit E2E org slug
  // (orgSettingsRoute), not the bare path: the proxy's active-workspace
  // resolution for a bare `/settings/*` path is cached server-side per
  // session and is not deterministic across parallel workers sharing one dev
  // server.
  async goToBilling(): Promise<void> {
    await this.open(orgSettingsRoute(APP_ROUTES.SETTINGS.CREDITS));
  }

  // The organization settings home is /settings/general; the legacy
  // /settings/organization path calls notFound()
  // (LegacyOrganizationSettingsNotFound).
  async goToOrganization(): Promise<void> {
    await this.open(orgSettingsRoute(APP_ROUTES.SETTINGS.GENERAL));
  }

  async goToApiKeys(): Promise<void> {
    await this.open(orgSettingsRoute(APP_ROUTES.SETTINGS.API_KEYS));
  }

  /**
   * Follow a settings sidebar link (a client transition) and assert the
   * destination without re-navigating.
   */
  async navigateFromSidebar(
    linkName: string,
    expectedPath: string,
  ): Promise<void> {
    await this.settingsNav
      .getByRole('link', { exact: true, name: linkName })
      .click();
    await expect(this.page).toHaveURL(new RegExp(`${expectedPath}$`));
    await expectNoErrorOverlay(this.page);
  }
}
