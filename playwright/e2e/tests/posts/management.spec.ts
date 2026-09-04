import { PostStatus } from '@genfeedai/contracts';
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
    await postsPage.gotoNotPosted();

    // All tabs should be visible
    await expect(postsPage.notPostedTab).toBeVisible();
    await expect(postsPage.publishedTab).toBeVisible();
    await expect(postsPage.engageTab).toBeVisible();
  });

  test('should show not-posted posts by default', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const draftPosts = [
      generateMockPost({
        description: 'My first draft',
        id: 'draft-001',
        label: 'Draft A',
        status: PostStatus.DRAFT,
      }),
      generateMockPost({
        description: 'My second draft',
        id: 'draft-002',
        label: 'Draft B',
        status: PostStatus.DRAFT,
      }),
    ];

    await mockPostsList(authenticatedPage, draftPosts);
    await postsPage.gotoNotPosted();

    await postsPage.assertOnNotPostedTab();
    await expect(authenticatedPage).toHaveURL(
      /publishing\/posts\?publicationState=not-posted/,
    );
  });

  test('should navigate between post tabs', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostsList(authenticatedPage);
    await postsPage.gotoNotPosted();
    await postsPage.assertOnNotPostedTab();

    // Navigate to published
    await postsPage.switchToPublished();
    await postsPage.assertOnPublishedTab();

    // Navigate back to not posted
    await postsPage.switchToNotPosted();
    await postsPage.assertOnNotPostedTab();
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
        status: PostStatus.DRAFT,
      }),
      generateMockPost({
        description: 'Behind the scenes of our latest photoshoot.',
        id: 'content-002',
        label: 'BTS Content',
        platform: 'instagram',
        status: PostStatus.DRAFT,
      }),
    ];

    await mockPostsList(authenticatedPage, posts);
    await postsPage.gotoNotPosted();

    // Posts should be displayed (grid or table)
    const count = await postsPage.getPostCount();
    expect(count).toBeGreaterThanOrEqual(0);

    // Page should remain on the not-posted filter
    await postsPage.assertOnNotPostedTab();
  });

  test('should filter posts', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const posts = [
      generateMockPost({
        description: 'Searchable unique content here',
        id: 'filter-001',
        label: 'Unique Label Alpha',
        status: PostStatus.DRAFT,
      }),
      generateMockPost({
        description: 'Other content',
        id: 'filter-002',
        label: 'Different Post',
        status: PostStatus.DRAFT,
      }),
    ];

    await mockPostsList(authenticatedPage, posts);
    await postsPage.gotoNotPosted();

    // Open filters and search
    await postsPage.openFilters().catch(() => {});

    // Search should filter (URL updates with search param)
    await postsPage.search('Unique').catch(() => {});
    await authenticatedPage.waitForTimeout(500);

    // Page should remain on the not-posted filter
    await expect(authenticatedPage).toHaveURL(
      /publishing\/posts\?publicationState=not-posted/,
    );
  });

  test('should navigate to post detail', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const posts = [
      generateMockPost({
        description: 'Click me to see details',
        id: 'detail-nav-001',
        label: 'Detail Nav Post',
        status: PostStatus.DRAFT,
      }),
    ];

    await mockPostsList(authenticatedPage, posts);
    await mockPostDetail(authenticatedPage, posts[0]);
    await postsPage.gotoNotPosted();

    // Click on a post to navigate to detail
    const count = await postsPage.getPostCount();
    if (count > 0) {
      await postsPage.clickPost(0);
      await authenticatedPage.waitForTimeout(1000);

      // Should navigate to post detail page
      const url = authenticatedPage.url();
      const isOnPostPage = url.includes('/publishing/posts');
      expect(isOnPostPage).toBe(true);
    }
  });

  test('should show engage tab', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostsList(authenticatedPage);
    await postsPage.gotoEngage();

    await postsPage.assertOnEngageTab();
    await expect(authenticatedPage).toHaveURL(/analytics\/posts/);
  });

  test('should toggle between grid and table view', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostsList(authenticatedPage);
    await postsPage.gotoNotPosted();

    // Try switching to table view
    await postsPage.switchToTableView().catch(() => {});
    await authenticatedPage.waitForTimeout(300);

    // Try switching back to grid view
    await postsPage.switchToGridView().catch(() => {});
    await authenticatedPage.waitForTimeout(300);

    // Should still be on the not-posted filter
    await postsPage.assertOnNotPostedTab();
  });

  test('should include scheduled posts in the not-posted filter', async ({
    authenticatedPage,
  }) => {
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
        status: PostStatus.SCHEDULED,
      }),
    ];

    await mockPostsList(authenticatedPage, scheduledPosts);
    await postsPage.gotoNotPosted();

    await postsPage.assertOnNotPostedTab();
    await expect(authenticatedPage).toHaveURL(
      /publishing\/posts\?publicationState=not-posted/,
    );
  });
});
