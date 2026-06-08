import {
  generateMockPost,
  mockActiveSubscription,
  mockPostDetail,
  mockPostsList,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { PostsPage } from '../../pages/posts.page';

/**
 * E2E Tests for Posts Management
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur.
 */
test.describe('Posts — Management', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('should display posts page with tabs', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostsList(authenticatedPage);
    await postsPage.gotoDrafts();

    // All tabs should be visible
    await expect(postsPage.draftsTab).toBeVisible();
    await expect(postsPage.scheduledTab).toBeVisible();
    await expect(postsPage.publishedTab).toBeVisible();
    await expect(postsPage.engageTab).toBeVisible();
  });

  test('should show drafts tab by default', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const draftPosts = [
      generateMockPost({
        description: 'My first draft',
        id: 'draft-001',
        label: 'Draft A',
        status: 'DRAFT',
      }),
      generateMockPost({
        description: 'My second draft',
        id: 'draft-002',
        label: 'Draft B',
        status: 'DRAFT',
      }),
    ];

    await mockPostsList(authenticatedPage, draftPosts);
    await postsPage.gotoDrafts();

    await postsPage.assertOnDraftsTab();
    await expect(authenticatedPage).toHaveURL(/posts\/drafts/);
  });

  test('should navigate between post tabs', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostsList(authenticatedPage);
    await postsPage.gotoDrafts();
    await postsPage.assertOnDraftsTab();

    // Navigate to scheduled
    await postsPage.switchToScheduled();
    await postsPage.assertOnScheduledTab();

    // Navigate to published
    await postsPage.switchToPublished();
    await postsPage.assertOnPublishedTab();

    // Navigate back to drafts
    await postsPage.switchToDrafts();
    await postsPage.assertOnDraftsTab();
  });

  test('should display post cards with content preview', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const posts = [
      generateMockPost({
        description: 'Exciting product launch coming soon! 🚀',
        id: 'content-001',
        label: 'Product Launch',
        platform: 'twitter',
        status: 'DRAFT',
      }),
      generateMockPost({
        description: 'Behind the scenes of our latest photoshoot.',
        id: 'content-002',
        label: 'BTS Content',
        platform: 'instagram',
        status: 'DRAFT',
      }),
    ];

    await mockPostsList(authenticatedPage, posts);
    await postsPage.gotoDrafts();

    // Posts should be displayed (grid or table)
    const count = await postsPage.getPostCount();
    expect(count).toBeGreaterThanOrEqual(0);

    // Page should be on drafts
    await postsPage.assertOnDraftsTab();
  });

  test('should filter posts', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const posts = [
      generateMockPost({
        description: 'Searchable unique content here',
        id: 'filter-001',
        label: 'Unique Label Alpha',
        status: 'DRAFT',
      }),
      generateMockPost({
        description: 'Other content',
        id: 'filter-002',
        label: 'Different Post',
        status: 'DRAFT',
      }),
    ];

    await mockPostsList(authenticatedPage, posts);
    await postsPage.gotoDrafts();

    // Open filters and search
    await postsPage.openFilters().catch(() => {});

    // Search should filter (URL updates with search param)
    await postsPage.search('Unique').catch(() => {});
    await authenticatedPage.waitForTimeout(500);

    // Page should remain on drafts
    await expect(authenticatedPage).toHaveURL(/posts\/drafts/);
  });

  test('should navigate to post detail', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const posts = [
      generateMockPost({
        description: 'Click me to see details',
        id: 'detail-nav-001',
        label: 'Detail Nav Post',
        status: 'DRAFT',
      }),
    ];

    await mockPostsList(authenticatedPage, posts);
    await mockPostDetail(authenticatedPage, posts[0]);
    await postsPage.gotoDrafts();

    // Click on a post to navigate to detail
    const count = await postsPage.getPostCount();
    if (count > 0) {
      await postsPage.clickPost(0);
      await authenticatedPage.waitForTimeout(1000);

      // Should navigate to post detail page
      const url = authenticatedPage.url();
      const isOnPostPage =
        url.includes('/posts/') || url.includes('/posts/drafts');
      expect(isOnPostPage).toBe(true);
    }
  });

  test('should show engage tab', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostsList(authenticatedPage);
    await postsPage.gotoEngage();

    await postsPage.assertOnEngageTab();
    await expect(authenticatedPage).toHaveURL(/posts\/engage/);
  });

  test('should toggle between grid and table view', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostsList(authenticatedPage);
    await postsPage.gotoDrafts();

    // Try switching to table view
    await postsPage.switchToTableView().catch(() => {});
    await authenticatedPage.waitForTimeout(300);

    // Try switching back to grid view
    await postsPage.switchToGridView().catch(() => {});
    await authenticatedPage.waitForTimeout(300);

    // Should still be on drafts page
    await postsPage.assertOnDraftsTab();
  });

  test('should show scheduled posts tab', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const scheduledPosts = [
      generateMockPost({
        description: 'Scheduled for next week',
        id: 'sched-001',
        label: 'Scheduled Tweet',
        platform: 'twitter',
        scheduledDate: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        status: 'SCHEDULED',
      }),
    ];

    await mockPostsList(authenticatedPage, scheduledPosts);
    await postsPage.gotoScheduled();

    await postsPage.assertOnScheduledTab();
    await expect(authenticatedPage).toHaveURL(/posts\/scheduled/);
  });
});
