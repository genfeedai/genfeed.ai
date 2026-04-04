import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Dashboard/Overview Page
 *
 * Provides an abstraction layer for interacting with the main dashboard
 * including navigation, activity feed, and analytics widgets.
 *
 * @module dashboard.page
 */
export class DashboardPage {
  readonly page: Page;
  readonly url = '/overview';

  // Main layout
  readonly sidebar: Locator;
  readonly topbar: Locator;
  readonly mainContent: Locator;

  // Navigation items
  readonly navOverview: Locator;
  readonly navStudio: Locator;
  readonly navActivities: Locator;
  readonly navEditor: Locator;
  readonly navSettings: Locator;

  // User menu
  readonly userMenuButton: Locator;
  readonly userMenuDropdown: Locator;
  readonly logoutButton: Locator;
  readonly profileLink: Locator;

  // Statistics/Widgets
  readonly statsSection: Locator;
  readonly videoCountWidget: Locator;
  readonly imageCountWidget: Locator;
  readonly creditUsageWidget: Locator;
  readonly storageWidget: Locator;

  // Activity feed
  readonly activitySection: Locator;
  readonly activityList: Locator;
  readonly activityItem: Locator;

  // Recent content
  readonly recentContentSection: Locator;
  readonly recentVideoCard: Locator;
  readonly recentImageCard: Locator;

  // Quick actions
  readonly quickActionsSection: Locator;
  readonly createVideoButton: Locator;
  readonly createImageButton: Locator;
  readonly uploadButton: Locator;

  // Search
  readonly searchInput: Locator;
  readonly searchResults: Locator;

  // Organization selector
  readonly orgSelector: Locator;
  readonly orgDropdown: Locator;

  // Loading states
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.sidebar = page.locator(
      '[data-testid="sidebar"], aside, nav[role="navigation"]',
    );
    this.topbar = page.locator('[data-testid="topbar"], header');
    this.mainContent = page.locator('main, [data-testid="main-content"]');

    // Navigation - sidebar links
    this.navOverview = page.locator(
      'a[href="/overview"], a[href*="overview"], [data-testid="nav-overview"]',
    );
    this.navStudio = page.locator(
      'a[href="/studio"], a[href*="studio"], [data-testid="nav-studio"]',
    );
    this.navActivities = page.locator(
      'a[href="/activities"], a[href*="activities"], [data-testid="nav-activities"]',
    );
    this.navEditor = page.locator(
      'a[href="/editor"], a[href*="editor"], [data-testid="nav-editor"]',
    );
    this.navSettings = page.locator(
      'a[href="/settings"], a[href*="settings"], [data-testid="nav-settings"]',
    );

    // User menu
    this.userMenuButton = page.locator(
      '[data-testid="user-menu"], [data-testid="user-button"], button[aria-label*="user" i]',
    );
    this.userMenuDropdown = page.locator(
      '[data-testid="user-menu-dropdown"], [role="menu"]',
    );
    this.logoutButton = page.locator(
      'button:has-text("Log out"), button:has-text("Sign out"), a[href*="logout"]',
    );
    this.profileLink = page.locator(
      'a:has-text("Profile"), a[href*="profile"]',
    );

    // Statistics widgets
    this.statsSection = page.locator(
      '[data-testid="stats-section"], [data-testid="statistics"]',
    );
    this.videoCountWidget = page.locator(
      '[data-testid="video-count"], [data-stat="videos"]',
    );
    this.imageCountWidget = page.locator(
      '[data-testid="image-count"], [data-stat="images"]',
    );
    this.creditUsageWidget = page.locator(
      '[data-testid="credit-usage"], [data-stat="credits"]',
    );
    this.storageWidget = page.locator(
      '[data-testid="storage-usage"], [data-stat="storage"]',
    );

    // Activity feed
    this.activitySection = page.locator(
      '[data-testid="activity-section"], [data-testid="activity-feed"]',
    );
    this.activityList = page.locator(
      '[data-testid="activity-list"], ul[role="list"]',
    );
    this.activityItem = page.locator(
      '[data-testid="activity-item"], [data-activity]',
    );

    // Recent content
    this.recentContentSection = page.locator(
      '[data-testid="recent-content"], [data-testid="recent-creations"]',
    );
    this.recentVideoCard = page.locator(
      '[data-testid="recent-video"], [data-recent-type="video"]',
    );
    this.recentImageCard = page.locator(
      '[data-testid="recent-image"], [data-recent-type="image"]',
    );

    // Quick actions
    this.quickActionsSection = page.locator(
      '[data-testid="quick-actions"], [data-testid="actions"]',
    );
    this.createVideoButton = page.locator(
      'button:has-text("Create Video"), a:has-text("Create Video")',
    );
    this.createImageButton = page.locator(
      'button:has-text("Create Image"), a:has-text("Create Image")',
    );
    this.uploadButton = page.locator(
      'button:has-text("Upload"), [data-testid="upload-button"]',
    );

    // Search
    this.searchInput = page.locator(
      '[data-testid="search-input"], input[type="search"], input[placeholder*="search" i]',
    );
    this.searchResults = page.locator(
      '[data-testid="search-results"], [role="listbox"]',
    );

    // Organization selector
    this.orgSelector = page.locator(
      '[data-testid="org-selector"], [data-testid="organization-selector"]',
    );
    this.orgDropdown = page.locator(
      '[data-testid="org-dropdown"], [role="menu"]',
    );

    // Loading states
    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');
  }

  /**
   * Navigate to the dashboard/overview page
   */
  async goto(): Promise<void> {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  /**
   * Wait for the dashboard to fully load
   */
  async waitForPageLoad(): Promise<void> {
    // Avoid `networkidle` for app pages with background polling; it can add 30s stalls.
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for main content
    await this.mainContent
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => {
        // Might be on a different page structure
      });

    // Wait for loading states to clear
    await this.waitForLoadingComplete();
  }

  /**
   * Wait for all loading indicators to disappear
   */
  async waitForLoadingComplete(): Promise<void> {
    const loadingSelectors = [
      '[data-testid="loading"]',
      '.loading',
      '.spinner',
      '[aria-busy="true"]',
      '.skeleton',
    ];

    for (const selector of loadingSelectors) {
      const element = this.page.locator(selector).first();
      const isVisible = await element.isVisible().catch(() => false);

      if (isVisible) {
        await element.waitFor({ state: 'hidden', timeout: 30000 }).catch(() => {
          // Element might have disappeared quickly
        });
      }
    }
  }

  /**
   * Check if the dashboard is displayed
   */
  async isDisplayed(): Promise<boolean> {
    const url = this.page.url();
    return url.includes('/overview') || url.includes('/dashboard');
  }

  // Navigation methods
  async navigateToStudio(): Promise<void> {
    await this.navStudio.click();
    await this.page.waitForURL(/studio|g\//);
  }

  async navigateToActivities(): Promise<void> {
    await this.navActivities.click();
    await this.page.waitForURL(/activities/);
  }

  async navigateToEditor(): Promise<void> {
    await this.navEditor.click();
    await this.page.waitForURL(/editor/);
  }

  async navigateToSettings(): Promise<void> {
    await this.navSettings.click();
    await this.page.waitForURL(/settings/);
  }

  /**
   * Open the user menu
   */
  async openUserMenu(): Promise<void> {
    await this.userMenuButton.click();
    await this.userMenuDropdown.waitFor({ state: 'visible' });
  }

  /**
   * Log out from the user menu
   */
  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.logoutButton.click();
  }

  /**
   * Navigate to profile from user menu
   */
  async goToProfile(): Promise<void> {
    await this.openUserMenu();
    await this.profileLink.click();
  }

  /**
   * Search for content
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
    await this.page.waitForLoadState('domcontentloaded');
  }

  /**
   * Get the number of activity items
   */
  async getActivityCount(): Promise<number> {
    return await this.activityItem.count();
  }

  /**
   * Get activity item text by index
   */
  async getActivityText(index = 0): Promise<string> {
    return (await this.activityItem.nth(index).textContent()) || '';
  }

  /**
   * Click on a quick action button
   */
  async clickQuickAction(action: 'video' | 'image' | 'upload'): Promise<void> {
    const buttonMap = {
      image: this.createImageButton,
      upload: this.uploadButton,
      video: this.createVideoButton,
    };

    await buttonMap[action].click();
  }

  /**
   * Get stat widget value
   */
  async getStatValue(
    stat: 'videos' | 'images' | 'credits' | 'storage',
  ): Promise<string> {
    const widgetMap = {
      credits: this.creditUsageWidget,
      images: this.imageCountWidget,
      storage: this.storageWidget,
      videos: this.videoCountWidget,
    };

    return (await widgetMap[stat].textContent()) || '';
  }

  /**
   * Click on a recent content card
   */
  async clickRecentContent(type: 'video' | 'image', index = 0): Promise<void> {
    const card = type === 'video' ? this.recentVideoCard : this.recentImageCard;
    await card.nth(index).click();
  }

  /**
   * Switch organization
   */
  async switchOrganization(orgName: string): Promise<void> {
    await this.orgSelector.click();
    await this.page.click(`[role="menuitem"]:has-text("${orgName}")`);
    await this.page.waitForLoadState('domcontentloaded');
  }

  // Assertions
  async assertSidebarVisible(): Promise<void> {
    await expect(this.sidebar).toBeVisible();
  }

  async assertTopbarVisible(): Promise<void> {
    await expect(this.topbar).toBeVisible();
  }

  async assertActivitiesDisplayed(minCount = 1): Promise<void> {
    const count = await this.getActivityCount();
    expect(count).toBeGreaterThanOrEqual(minCount);
  }

  async assertStatsDisplayed(): Promise<void> {
    // At least one stat widget should be visible
    const hasVideoStat = await this.videoCountWidget
      .isVisible()
      .catch(() => false);
    const hasImageStat = await this.imageCountWidget
      .isVisible()
      .catch(() => false);
    const hasCreditStat = await this.creditUsageWidget
      .isVisible()
      .catch(() => false);

    expect(hasVideoStat || hasImageStat || hasCreditStat).toBe(true);
  }

  async assertNavigationWorks(): Promise<void> {
    // Test that we can navigate away and back
    const currentUrl = this.page.url();

    await this.navigateToActivities();
    await expect(this.page).toHaveURL(/activities/);

    await this.page.goto(currentUrl);
    await expect(this.page).toHaveURL(currentUrl);
  }

  /**
   * Take a screenshot of the dashboard
   */
  async takeScreenshot(name = 'dashboard'): Promise<void> {
    await this.page.screenshot({
      fullPage: true,
      path: `playwright-report/screenshots/${name}-${Date.now()}.png`,
    });
  }

  /**
   * Check if the sidebar is collapsed (mobile view)
   */
  async isSidebarCollapsed(): Promise<boolean> {
    const sidebar = this.sidebar;
    if (!(await sidebar.isVisible().catch(() => false))) {
      return true;
    }
    const classList = await sidebar.getAttribute('class');
    return (
      classList?.includes('collapsed') || classList?.includes('hidden') || false
    );
  }

  /**
   * Toggle sidebar (for mobile/responsive testing)
   */
  async toggleSidebar(): Promise<void> {
    const hamburgerButton = this.page.locator(
      '[data-testid="menu-toggle"], button[aria-label="Toggle menu"]',
    );
    await hamburgerButton.click();
  }
}
