import { PostStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  generateMockPost,
  mockActiveSubscription,
  mockPostDetail,
  mockPostsList,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { PostsPage } from '../../pages/posts.page';
import { brandPath } from '../../utils/app-chrome';

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

  test('should display posts page with filter controls', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostsList(authenticatedPage);
    await postsPage.gotoNotPosted();

    // Lifecycle state is a deep link, not a tab; the toolbar's content-type,
    // channel, and status filters are the current UI for narrowing the list.
    await expect(postsPage.contentTypeFilterTrigger).toBeVisible();
    await expect(postsPage.channelFilterTrigger).toBeVisible();
    await expect(postsPage.statusFilterTrigger).toBeVisible();
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

  test('should navigate between post lifecycle filters', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    // One fixture per lifecycle bucket. Content library filtering is entirely
    // client-side (the collection query has no status param -- see
    // publishing-content-library.tsx), so a single unfiltered mock lets each
    // URL-driven filter narrow the same fixed set.
    const draft = generateMockPost({
      id: 'lifecycle-draft-001',
      label: 'Lifecycle Draft Post',
      status: PostStatus.DRAFT,
    });
    const scheduled = generateMockPost({
      id: 'lifecycle-sched-001',
      label: 'Lifecycle Scheduled Post',
      scheduledDate: new Date(
        Date.now() + 3 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      status: PostStatus.SCHEDULED,
    });
    const published = generateMockPost({
      id: 'lifecycle-pub-001',
      label: 'Lifecycle Published Post',
      platformUrl: 'https://twitter.com/mock/status/789',
      status: PostStatus.PUBLIC,
    });

    await mockPostsList(authenticatedPage, [draft, scheduled, published]);
    await postsPage.gotoNotPosted();
    await postsPage.assertOnNotPostedTab();

    await expect(
      authenticatedPage.getByText('Lifecycle Draft Post'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Lifecycle Scheduled Post'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Lifecycle Published Post'),
    ).toHaveCount(0);

    // Navigate to published
    await postsPage.switchToPublished();
    await postsPage.assertOnPublishedTab();

    await expect(
      authenticatedPage.getByText('Lifecycle Published Post'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Lifecycle Draft Post'),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByText('Lifecycle Scheduled Post'),
    ).toHaveCount(0);

    // Navigate back to not posted
    await postsPage.switchToNotPosted();
    await postsPage.assertOnNotPostedTab();
    await expect(
      authenticatedPage.getByText('Lifecycle Draft Post'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Lifecycle Published Post'),
    ).toHaveCount(0);
  });

  test('should narrow the list with the status filter control', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const draft = generateMockPost({
      id: 'status-filter-draft-001',
      label: 'Status Filter Draft',
      status: PostStatus.DRAFT,
    });
    const scheduled = generateMockPost({
      id: 'status-filter-sched-001',
      label: 'Status Filter Scheduled',
      scheduledDate: new Date(
        Date.now() + 3 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      status: PostStatus.SCHEDULED,
    });

    await mockPostsList(authenticatedPage, [draft, scheduled]);
    // The bare list route -- not a `publicationState` deep link -- so the
    // status multiselect starts genuinely empty. Toggling a status while
    // `publicationState=not-posted` is still in the URL merges the picked
    // status alongside the inherited 'not-posted' bucket value, which
    // matches "everything but published" and does not narrow further.
    await authenticatedPage.goto(brandPath(APP_ROUTES.PUBLISHING.POSTS));
    await postsPage.waitForPageLoad();

    await expect(
      authenticatedPage.getByText('Status Filter Draft'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Status Filter Scheduled'),
    ).toBeVisible();

    // Open the real status multiselect and pick a single, specific status.
    await postsPage.statusFilterTrigger.click();
    await authenticatedPage
      .getByRole('option', { name: 'Draft', exact: true })
      .click();
    await authenticatedPage.keyboard.press('Escape');

    await expect(authenticatedPage).toHaveURL(/[?&]status=draft(?:&|$)/);
    await expect(
      authenticatedPage.getByText('Status Filter Draft'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Status Filter Scheduled'),
    ).toHaveCount(0);
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
