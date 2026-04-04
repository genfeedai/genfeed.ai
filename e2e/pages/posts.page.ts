import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Page Object Model for the Posts Management Page
 *
 * Provides an abstraction layer for interacting with
 * posts list, tabs, filtering, and post detail views.
 *
 * @module posts.page
 */
export class PostsPage {
  readonly page: Page;

  // Layout
  readonly mainContent: Locator;
  readonly loadingIndicator: Locator;
  readonly pageTitle: Locator;

  // Tabs
  readonly draftsTab: Locator;
  readonly scheduledTab: Locator;
  readonly publishedTab: Locator;
  readonly engageTab: Locator;

  // View toggles
  readonly gridViewButton: Locator;
  readonly tableViewButton: Locator;

  // Stats cards
  readonly statsCards: Locator;

  // Post list / grid
  readonly postCards: Locator;
  readonly postRows: Locator;
  readonly emptyState: Locator;

  // Post card elements
  readonly postThumbnail: Locator;
  readonly postContent: Locator;
  readonly postPlatformBadge: Locator;
  readonly postStatusBadge: Locator;

  // Actions
  readonly editButton: Locator;
  readonly deleteButton: Locator;
  readonly viewDetailsButton: Locator;
  readonly remixButton: Locator;

  // Filters
  readonly filtersButton: Locator;
  readonly searchInput: Locator;
  readonly sortDropdown: Locator;
  readonly statusFilter: Locator;

  // Pagination
  readonly pagination: Locator;

  // Prompt bar (publisher)
  readonly promptBar: Locator;
  readonly promptInput: Locator;
  readonly generateButton: Locator;

  // Refresh
  readonly refreshButton: Locator;

  // Post detail
  readonly breadcrumb: Locator;
  readonly postDetailContent: Locator;
  readonly postDetailSidebar: Locator;
  readonly scheduleDatePicker: Locator;
  readonly saveScheduleButton: Locator;

  // Confirm delete modal
  readonly confirmDeleteModal: Locator;
  readonly confirmDeleteButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // Layout
    this.mainContent = page.locator('main, [data-testid="main-content"]');
    this.loadingIndicator = page.locator(
      '[data-testid="loading"], .loading, .spinner',
    );
    this.pageTitle = page.locator(
      'h1:has-text("Posts"), [data-testid="page-title"]',
    );

    // Tabs
    this.draftsTab = page.locator(
      'a[href="/posts"], [role="tab"]:has-text("Drafts")',
    );
    this.scheduledTab = page.locator(
      'a[href="/posts?status=scheduled"], [role="tab"]:has-text("Scheduled")',
    );
    this.publishedTab = page.locator(
      'a[href="/posts?status=public"], [role="tab"]:has-text("Published")',
    );
    this.engageTab = page.locator(
      'a[href="/analytics/posts"], [role="tab"]:has-text("Analytics")',
    );

    // View toggles
    this.gridViewButton = page.locator(
      'button[aria-label="Card View"],' + ' button:has-text("Card View")',
    );
    this.tableViewButton = page.locator(
      'button[aria-label="Table View"],' + ' button:has-text("Table View")',
    );

    // Stats cards
    this.statsCards = page.locator(
      '[data-testid="stats-cards"],' +
        ' [class*="stats-card"],' +
        ' [class*="StatsCards"]',
    );

    // Post list elements
    this.postCards = page.locator(
      '[data-testid="post-card"],' +
        ' [class*="post-card"],' +
        ' [class*="PostCard"]',
    );
    this.postRows = page.locator('table tbody tr');
    this.emptyState = page.locator(
      'text=No posts found,' + ' [data-testid="empty-state"]',
    );

    // Post card sub-elements
    this.postThumbnail = page.locator(
      '[data-testid="post-thumbnail"],' +
        ' .aspect-video img,' +
        ' .aspect-video video',
    );
    this.postContent = page.locator(
      '[data-testid="post-content"],' + ' .font-semibold',
    );
    this.postPlatformBadge = page.locator(
      '[data-testid="platform-badge"],' + ' [class*="PlatformBadge"]',
    );
    this.postStatusBadge = page.locator(
      '[data-testid="status-badge"],' + ' [class*="Badge"]',
    );

    // Action buttons
    this.editButton = page.locator(
      'button[aria-label="Edit Post"],' + ' button:has([data-icon="pencil"])',
    );
    this.deleteButton = page.locator(
      'button[aria-label="Delete"],' + ' button:has([data-icon="trash"])',
    );
    this.viewDetailsButton = page.locator(
      'button[aria-label="View Post Details"],' +
        ' button:has([data-icon="document-text"])',
    );
    this.remixButton = page.locator(
      'button[aria-label="Create Remix"],' +
        ' button:has([data-icon="document-duplicate"])',
    );

    // Filters
    this.filtersButton = page.locator(
      '[data-testid="filters-button"],' + ' button:has-text("Filters")',
    );
    this.searchInput = page.locator(
      'input[placeholder*="search" i],' +
        ' input[name="search"],' +
        ' [data-testid="search-input"]',
    );
    this.sortDropdown = page.locator(
      '[data-testid="sort-dropdown"],' + ' select[name="sort"]',
    );
    this.statusFilter = page.locator('[data-testid="status-filter"]');

    // Pagination
    this.pagination = page.locator(
      '[data-testid="pagination"],' +
        ' [class*="Pagination"],' +
        ' nav[aria-label="pagination"]',
    );

    // Prompt bar
    this.promptBar = page.locator(
      '[data-testid="prompt-bar"],' +
        ' [class*="PromptBar"],' +
        ' [class*="prompt-bar"]',
    );
    this.promptInput = page.locator(
      '[data-testid="prompt-bar"] textarea,' +
        ' [class*="PromptBar"] textarea,' +
        ' [class*="prompt-bar"] textarea',
    );
    this.generateButton = page.locator('button:has-text("Generate")');

    // Refresh
    this.refreshButton = page.locator(
      'button[aria-label*="refresh" i],' +
        ' button[aria-label*="Refresh" i],' +
        ' [data-testid="refresh-button"]',
    );

    // Post detail page
    this.breadcrumb = page.locator(
      '[data-testid="breadcrumb"],' +
        ' nav[aria-label="breadcrumb"],' +
        ' [class*="Breadcrumb"]',
    );
    this.postDetailContent = page.locator(
      '[data-testid="post-detail-content"],' + ' [class*="PostDetailContent"]',
    );
    this.postDetailSidebar = page.locator(
      '[data-testid="post-detail-sidebar"],' + ' [class*="PostDetailSidebar"]',
    );
    this.scheduleDatePicker = page.locator(
      'input[type="datetime-local"],' + ' [data-testid="schedule-picker"]',
    );
    this.saveScheduleButton = page.locator(
      'button:has-text("Save Schedule"),' +
        ' button:has-text("Save"),' +
        ' [data-testid="save-schedule"]',
    );

    // Confirm delete modal
    this.confirmDeleteModal = page.locator(
      '[role="dialog"]:has-text("Delete")',
    );
    this.confirmDeleteButton = page.locator(
      '[role="dialog"] button:has-text("Delete"),' +
        ' [role="dialog"] button:has-text("Confirm")',
    );
  }

  // ── Navigation ──────────────────────────────────────────

  async gotoDrafts(): Promise<void> {
    await this.page.goto('/posts');
    await this.waitForPageLoad();
  }

  async gotoScheduled(): Promise<void> {
    await this.page.goto('/posts?status=scheduled');
    await this.waitForPageLoad();
  }

  async gotoPublished(): Promise<void> {
    await this.page.goto('/posts?status=public');
    await this.waitForPageLoad();
  }

  async gotoEngage(): Promise<void> {
    await this.page.goto('/analytics/posts');
    await this.waitForPageLoad();
  }

  async gotoReview(): Promise<void> {
    await this.page.goto('/posts/review');
    await this.waitForPageLoad();
  }

  async gotoCalendar(): Promise<void> {
    await this.page.goto('/posts/calendar');
    await this.waitForPageLoad();
  }

  async gotoPostDetail(postId: string): Promise<void> {
    await this.page.goto(`/posts/${postId}`);
    await this.waitForPageLoad();
  }

  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    await this.mainContent
      .waitFor({ state: 'visible', timeout: 15000 })
      .catch(() => {});
    const spinner = this.loadingIndicator;
    const visible = await spinner.isVisible().catch(() => false);
    if (visible) {
      await spinner.waitFor({
        state: 'hidden',
        timeout: 30000,
      });
    }
  }

  // ── Tab interactions ────────────────────────────────────

  async switchToDrafts(): Promise<void> {
    await this.draftsTab.click();
    await this.waitForPageLoad();
  }

  async switchToScheduled(): Promise<void> {
    await this.scheduledTab.click();
    await this.waitForPageLoad();
  }

  async switchToPublished(): Promise<void> {
    await this.publishedTab.click();
    await this.waitForPageLoad();
  }

  async switchToEngage(): Promise<void> {
    await this.engageTab.click();
    await this.waitForPageLoad();
  }

  // ── View toggles ───────────────────────────────────────

  async switchToGridView(): Promise<void> {
    await this.gridViewButton.first().click();
    await this.page.waitForTimeout(300);
  }

  async switchToTableView(): Promise<void> {
    await this.tableViewButton.first().click();
    await this.page.waitForTimeout(300);
  }

  // ── Post list helpers ──────────────────────────────────

  async getPostCount(): Promise<number> {
    const cardCount = await this.postCards.count();
    if (cardCount > 0) {
      return cardCount;
    }
    return await this.postRows.count();
  }

  async clickPost(index = 0): Promise<void> {
    const cardCount = await this.postCards.count();
    if (cardCount > 0) {
      await this.postCards.nth(index).click();
    } else {
      await this.postRows.nth(index).click();
    }
  }

  async getPostText(index = 0): Promise<string> {
    const cardCount = await this.postCards.count();
    if (cardCount > 0) {
      return (await this.postCards.nth(index).textContent()) || '';
    }
    return (await this.postRows.nth(index).textContent()) || '';
  }

  // ── Filter / search ────────────────────────────────────

  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.waitForTimeout(500);
  }

  async openFilters(): Promise<void> {
    await this.filtersButton.click();
    await this.page.waitForTimeout(300);
  }

  // ── Prompt bar ─────────────────────────────────────────

  async generatePosts(prompt: string): Promise<void> {
    await this.promptInput.fill(prompt);
    await this.generateButton.click();
  }

  // ── Post detail helpers ────────────────────────────────

  async assertPostDetailVisible(): Promise<void> {
    await expect(this.page).toHaveURL(/\/posts\/.+/);
    await expect(this.breadcrumb.first()).toBeVisible();
  }

  // ── Assertions ─────────────────────────────────────────

  async assertOnDraftsTab(): Promise<void> {
    await expect(this.page).toHaveURL(/\/posts(?:\?|$)/);
  }

  async assertOnScheduledTab(): Promise<void> {
    await expect(this.page).toHaveURL(/\/posts\?status=scheduled/);
  }

  async assertOnPublishedTab(): Promise<void> {
    await expect(this.page).toHaveURL(/\/posts\?status=public/);
  }

  async assertOnEngageTab(): Promise<void> {
    await expect(this.page).toHaveURL(/\/analytics\/posts/);
  }

  async assertPostsDisplayed(minCount = 1): Promise<void> {
    const count = await this.getPostCount();
    expect(count).toBeGreaterThanOrEqual(minCount);
  }

  async assertEmptyState(): Promise<void> {
    await expect(this.emptyState.first()).toBeVisible();
  }

  async assertPageTitle(): Promise<void> {
    const heading = this.page.locator('h1, [data-testid="page-title"]');
    await expect(heading.first()).toBeVisible();
  }
}
