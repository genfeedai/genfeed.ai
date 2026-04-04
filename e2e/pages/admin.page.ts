import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Admin Dashboard
 *
 * Covers overview, users, templates, darkroom, CRM, and analytics.
 *
 * @module admin.page
 */
export class AdminPage {
  readonly page: Page;

  // Layout
  readonly mainContent: Locator;
  readonly heading: Locator;
  readonly sidebar: Locator;

  // Overview / KPI
  readonly kpiCards: Locator;
  readonly quickActionCards: Locator;
  readonly activityChart: Locator;

  // Users
  readonly usersTable: Locator;
  readonly usersRows: Locator;
  readonly usersRefreshButton: Locator;

  // Templates
  readonly templateCards: Locator;
  readonly templateEmptyState: Locator;

  // Darkroom
  readonly darkroomGalleryGrid: Locator;
  readonly darkroomCharactersList: Locator;
  readonly darkroomPipelineContent: Locator;

  // CRM
  readonly crmLeadsTable: Locator;
  readonly crmCompaniesTable: Locator;
  readonly crmTasksContent: Locator;

  // Analytics
  readonly analyticsContent: Locator;

  // Loading
  readonly loadingSpinner: Locator;
  readonly skeleton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.heading = page.getByRole('heading').first();
    this.sidebar = page.locator('[data-testid="sidebar"], aside, nav');

    // KPI / Overview
    this.kpiCards = page.locator(
      '[data-testid="kpi-card"], .kpi-card, ' +
        '[class*="kpi"], [class*="KPI"]',
    );
    this.quickActionCards = page.locator(
      '[data-testid="quick-action"], .quick-action, ' +
        'a[href="/users"], a[href="/templates"]',
    );
    this.activityChart = page.locator(
      '[data-testid="activity-chart"], .recharts-wrapper, ' +
        'canvas, svg.recharts-surface',
    );

    // Users
    this.usersTable = page.locator(
      'table, [data-testid="users-table"], [role="table"]',
    );
    this.usersRows = page.locator('table tbody tr, [data-testid="user-row"]');
    this.usersRefreshButton = page.locator(
      'button:has-text("Refresh"), [data-testid="refresh"]',
    );

    // Templates
    this.templateCards = page.locator(
      '[data-testid="template-card"], .template-card, ' +
        'article, [class*="card"]',
    );
    this.templateEmptyState = page.locator(
      '[data-testid="empty-state"], .empty-state',
    );

    // Darkroom
    this.darkroomGalleryGrid = page.locator(
      '[data-testid="gallery-grid"], .gallery-grid, ' +
        '.image-grid, [class*="grid"]',
    );
    this.darkroomCharactersList = page.locator(
      '[data-testid="characters-list"], .characters-list, ' +
        'table, [role="table"]',
    );
    this.darkroomPipelineContent = page.locator(
      '[data-testid="pipeline"], .pipeline',
    );

    // CRM
    this.crmLeadsTable = page.locator(
      'table, [data-testid="leads-table"], [role="table"]',
    );
    this.crmCompaniesTable = page.locator(
      'table, [data-testid="companies-table"], [role="table"]',
    );
    this.crmTasksContent = page.locator(
      '[data-testid="tasks-content"], .tasks-content',
    );

    // Analytics
    this.analyticsContent = page.locator(
      '[data-testid="analytics"], .analytics, main',
    );

    // Loading
    this.loadingSpinner = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.skeleton = page.locator('[data-testid="skeleton"], .skeleton');
  }

  // ---------- Navigation ----------

  async gotoOverview(): Promise<void> {
    await this.page.goto('/overview', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoUsers(): Promise<void> {
    await this.page.goto('/users', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoTemplates(): Promise<void> {
    await this.page.goto('/templates', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoDarkroomGallery(): Promise<void> {
    await this.page.goto('/darkroom/gallery', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoDarkroomCharacters(): Promise<void> {
    await this.page.goto('/darkroom/characters', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoDarkroomPipeline(): Promise<void> {
    await this.page.goto('/darkroom/pipeline', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoDarkroomInfrastructure(): Promise<void> {
    await this.page.goto('/darkroom/infrastructure', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoCrmLeads(): Promise<void> {
    await this.page.goto('/crm/leads', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoCrmCompanies(): Promise<void> {
    await this.page.goto('/crm/companies', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoCrmTasks(): Promise<void> {
    await this.page.goto('/crm/tasks', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoCrmAnalytics(): Promise<void> {
    await this.page.goto('/crm/analytics', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoAnalyticsAll(): Promise<void> {
    await this.page.goto('/analytics/all', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoAnalyticsOrganizations(): Promise<void> {
    await this.page.goto('/analytics/organizations', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoAnalyticsBrands(): Promise<void> {
    await this.page.goto('/analytics/brands', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async gotoAnalyticsBusiness(): Promise<void> {
    await this.page.goto('/overview/analytics/business', {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForPageLoad();
  }

  async navigateViaLink(href: string): Promise<void> {
    await this.page.click(`a[href="${href}"]`);
    await this.waitForPageLoad();
  }

  // ---------- Waits ----------

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    const spinner = this.loadingSpinner;
    const visible = await spinner.isVisible().catch(() => false);
    if (visible) {
      await spinner
        .waitFor({ state: 'hidden', timeout: 30000 })
        .catch(() => {});
    }
  }

  // ---------- Assertions ----------

  async assertPageVisible(): Promise<void> {
    await expect(this.mainContent).toBeVisible({
      timeout: 15000,
    });
  }

  async assertHeadingVisible(): Promise<void> {
    await expect(this.heading).toBeVisible({ timeout: 10000 });
  }

  async assertKpiCardsVisible(): Promise<void> {
    await expect(this.kpiCards.first()).toBeVisible({
      timeout: 10000,
    });
  }

  async assertUsersTableVisible(): Promise<void> {
    await expect(this.usersTable.first()).toBeVisible({
      timeout: 10000,
    });
  }

  async assertTemplatesVisible(): Promise<void> {
    const cards = this.templateCards;
    const empty = this.templateEmptyState;
    // Either cards or an empty-state should render
    const hasCards = await cards
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmpty = await empty.isVisible().catch(() => false);
    expect(hasCards || hasEmpty).toBe(true);
  }

  async getUserRowCount(): Promise<number> {
    return await this.usersRows.count();
  }

  async getKpiCardCount(): Promise<number> {
    return await this.kpiCards.count();
  }
}
