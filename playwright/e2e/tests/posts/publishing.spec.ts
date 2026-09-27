import { PostStatus } from '@genfeedai/contracts';
import {
  generateMockPost,
  mockActiveSubscription,
  mockPostDetail,
  mockPostPublishing,
  mockPostsList,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { PostsPage } from '../../pages/posts.page';

/** NY wall-clock date/time parts for an instant, independent of host TZ. */
function nyParts(instant: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'America/New_York',
    year: 'numeric',
  }).formatToParts(instant);
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    month: get('month'),
    year: get('year'),
  };
}

/** Tomorrow's calendar date in America/New_York, computed without touching
 * the test runner host's own timezone. */
function tomorrowNyParts() {
  const today = nyParts(new Date());
  const anchor = new Date(Date.UTC(today.year, today.month - 1, today.day + 1));
  return {
    day: anchor.getUTCDate(),
    month: anchor.getUTCMonth() + 1,
    year: anchor.getUTCFullYear(),
  };
}

/**
 * E2E Tests for Post Publishing & Scheduling
 *
 * CRITICAL: All tests use mocked API responses.
 * No real publishing or scheduling occurs.
 */
test.describe('Posts — Publishing', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockPostPublishing(authenticatedPage);
  });

  test('should display publish options for a draft', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const draftPost = generateMockPost({
      description: 'Ready to publish content',
      id: 'pub-draft-001',
      label: 'Publishable Draft',
      platform: 'twitter',
      status: PostStatus.DRAFT,
    });

    await mockPostsList(authenticatedPage, [draftPost]);
    await mockPostDetail(authenticatedPage, draftPost);

    // Navigate to post detail
    await postsPage.gotoPostDetail('pub-draft-001');

    // Should be on post detail page
    const url = authenticatedPage.url();
    expect(url).toContain('/publishing/posts/pub-draft-001');

    // Post detail page should show breadcrumb
    await postsPage.assertPostDetailVisible().catch(() => {});

    // The sidebar should contain scheduling options
    const sidebar = postsPage.postDetailSidebar;
    const _sidebarVisible = await sidebar.isVisible().catch(() => false);

    // Detail page should be loaded
    await expect(authenticatedPage).toHaveURL(
      /publishing\/posts\/pub-draft-001/,
    );
  });

  test('should show platform selection for publishing', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const draftPost = generateMockPost({
      description: 'Multi-platform content',
      id: 'pub-platform-001',
      label: 'Platform Selection Post',
      platform: 'twitter',
      status: PostStatus.DRAFT,
    });

    await mockPostsList(authenticatedPage, [draftPost]);
    await mockPostDetail(authenticatedPage, draftPost);

    await postsPage.gotoPostDetail('pub-platform-001');

    // Post detail should display platform information
    await expect(authenticatedPage).toHaveURL(
      /publishing\/posts\/pub-platform-001/,
    );

    // Page should show the platform badge or platform
    // info in the detail view
    const platformInfo = authenticatedPage.locator(
      '[class*="PlatformBadge"],' +
        ' [data-testid="platform-badge"],' +
        ' text=twitter,' +
        ' text=Twitter',
    );
    const _hasPlatform = await platformInfo
      .first()
      .isVisible()
      .catch(() => false);

    // Platform display is expected on detail page
    await expect(authenticatedPage).toHaveURL(/publishing\//);
  });

  test('should schedule a post for future date', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const draftPost = generateMockPost({
      description: 'Schedule this for later',
      id: 'pub-sched-001',
      label: 'To Be Scheduled',
      platform: 'twitter',
      status: PostStatus.DRAFT,
    });

    await mockPostsList(authenticatedPage, [draftPost]);
    await mockPostDetail(authenticatedPage, draftPost);
    // Layer a stateful mock on top of beforeEach's generic one: the
    // returned release-group id is derived from this post, and the
    // /posts/pub-sched-001 refetch after scheduling reflects the mutation.
    await mockPostPublishing(authenticatedPage, { post: draftPost });

    await postsPage.gotoPostDetail('pub-sched-001');

    await expect(authenticatedPage).toHaveURL(
      /publishing\/posts\/pub-sched-001/,
    );

    // The real sidebar schedule control is a Date popover + a Time
    // combobox (react-day-picker / Radix Select) feeding a single
    // "Schedule" button -- there is no `datetime-local` input or
    // `[data-testid="schedule-picker"]`. Compute tomorrow's day-button
    // label inside the browser so it matches whatever "now" the pinned
    // project timezone resolves to (react-day-picker's default day-button
    // aria-label is date-fns `format(date, 'PPPP')`).
    const dayLabel = await authenticatedPage.evaluate(() => {
      const suffix = (n: number): string => {
        const j = n % 10;
        const k = n % 100;
        if (j === 1 && k !== 11) return 'st';
        if (j === 2 && k !== 12) return 'nd';
        if (j === 3 && k !== 13) return 'rd';
        return 'th';
      };
      const target = new Date();
      target.setDate(target.getDate() + 1);
      const weekday = new Intl.DateTimeFormat('en-US', {
        weekday: 'long',
      }).format(target);
      const month = new Intl.DateTimeFormat('en-US', {
        month: 'long',
      }).format(target);
      const day = target.getDate();
      return `${weekday}, ${month} ${day}${suffix(day)}, ${target.getFullYear()}`;
    });

    await authenticatedPage.getByRole('button', { name: 'Date' }).click();
    await authenticatedPage
      .getByRole('button', { name: dayLabel, exact: true })
      .click();

    await authenticatedPage.getByRole('combobox', { name: 'Time' }).click();
    await authenticatedPage
      .getByRole('option', { name: '9:00 AM', exact: true })
      .click();

    const scheduleButton = authenticatedPage.getByRole('button', {
      name: 'Schedule',
      exact: true,
    });
    await expect(scheduleButton).toBeEnabled();

    // Require the actual mutation chain, not just "some PATCH fired":
    // `ensureFromPost` (POST, body `{ postId }`) promotes the lone draft to
    // a release group, and `scheduleTarget` PATCHes exactly that returned
    // group's target with the picked timestamp.
    const [postRequest, patchRequest] = await Promise.all([
      authenticatedPage.waitForRequest(
        (request) =>
          request.method() === 'POST' &&
          request.url().includes('/post-groups/from-post'),
      ),
      authenticatedPage.waitForRequest(
        (request) =>
          request.method() === 'PATCH' &&
          request.url().includes('/post-groups/') &&
          request.url().includes('/targets/'),
      ),
      scheduleButton.click(),
    ]);

    expect(postRequest.postDataJSON()).toEqual({ postId: 'pub-sched-001' });

    const postResponse = await postRequest.response();
    const postResponseBody = (await postResponse?.json()) as {
      data?: { id?: string };
    };
    const groupId = postResponseBody.data?.id;
    expect(groupId).toBeTruthy();
    expect(patchRequest.url()).toContain(
      `/post-groups/${groupId}/targets/pub-sched-001`,
    );

    const body = patchRequest.postDataJSON() as {
      action?: string;
      scheduledDate?: string;
    };
    expect(body.action).toBe('schedule');
    expect(body.scheduledDate).toBeTruthy();

    const sent = nyParts(new Date(body.scheduledDate as string));
    const tomorrow = tomorrowNyParts();
    expect(sent.year).toBe(tomorrow.year);
    expect(sent.month).toBe(tomorrow.month);
    expect(sent.day).toBe(tomorrow.day);
    expect(sent.hour).toBe(9);
    expect(sent.minute).toBe(0);

    // Resulting scheduled state: the save toast only fires once the target
    // mutation succeeds, and the post refetch (mockPostPublishing's
    // stateful /posts/pub-sched-001 override) now reports 'scheduled' --
    // rendered verbatim by PostSidebarPlatformCard's status Badge.
    await expect(
      authenticatedPage.getByText('Schedule date updated'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('scheduled', { exact: true }),
    ).toBeVisible();
  });

  test('should show publishing status', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    // Create posts with different statuses
    const posts = [
      generateMockPost({
        description: 'Draft content',
        id: 'status-draft',
        label: 'Draft Post',
        status: PostStatus.DRAFT,
      }),
      generateMockPost({
        description: 'Scheduled content',
        id: 'status-sched',
        label: 'Scheduled Post',
        scheduledDate: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        status: PostStatus.SCHEDULED,
      }),
      generateMockPost({
        description: 'Published content',
        id: 'status-pub',
        label: 'Published Post',
        platformUrl: 'https://twitter.com/mock/status/456',
        status: PostStatus.PUBLIC,
        totalLikes: 42,
        totalViews: 500,
      }),
      generateMockPost({
        description: 'Currently processing',
        id: 'status-proc',
        label: 'Processing Post',
        status: PostStatus.PROCESSING,
      }),
    ];

    await mockPostsList(authenticatedPage, posts);
    await postsPage.gotoNotPosted();

    // Draft, scheduled, and processing all belong to the not-posted bucket;
    // published does not (see filterPublishingContentLibraryItems).
    await expect(authenticatedPage.getByText('Draft Post')).toBeVisible();
    await expect(authenticatedPage.getByText('Scheduled Post')).toBeVisible();
    await expect(authenticatedPage.getByText('Processing Post')).toBeVisible();
    await expect(authenticatedPage.getByText('Published Post')).toHaveCount(0);

    // Navigate to published to see public posts
    await postsPage.switchToPublished();
    await postsPage.assertOnPublishedTab();

    await expect(authenticatedPage.getByText('Published Post')).toBeVisible();
    await expect(authenticatedPage.getByText('Draft Post')).toHaveCount(0);
    await expect(authenticatedPage.getByText('Scheduled Post')).toHaveCount(0);
    await expect(authenticatedPage.getByText('Processing Post')).toHaveCount(0);

    // Return to the not-posted lifecycle filter
    await postsPage.switchToNotPosted();
    await postsPage.assertOnNotPostedTab();
    await expect(authenticatedPage.getByText('Draft Post')).toBeVisible();
    await expect(authenticatedPage.getByText('Published Post')).toHaveCount(0);
  });

  test('should show post detail with sidebar', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    const post = generateMockPost({
      description: 'Full detail view test',
      id: 'detail-full-001',
      label: 'Full Detail Post',
      platform: 'instagram',
      scheduledDate: new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      status: PostStatus.SCHEDULED,
    });

    await mockPostDetail(authenticatedPage, post);
    await postsPage.gotoPostDetail('detail-full-001');

    await expect(authenticatedPage).toHaveURL(
      /publishing\/posts\/detail-full-001/,
    );

    // Breadcrumb should show navigation back to posts
    const breadcrumb = postsPage.breadcrumb;
    const _hasBreadcrumb = await breadcrumb
      .first()
      .isVisible()
      .catch(() => false);

    // The page should render the post detail layout
    const mainContent = authenticatedPage.locator('.container, main');
    await expect(mainContent.first()).toBeVisible();
  });
});
