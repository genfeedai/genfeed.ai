import {
  generateMockPost,
  mockActiveSubscription,
  mockAnalyticsData,
  mockBrandIdentityDefaults,
  mockCalendarPosts,
  mockImageGenerationSuccess,
  mockPostDetail,
  mockPostsList,
  mockReviewQueue,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AnalyticsPage } from '../../pages/analytics.page';
import { OverviewPage } from '../../pages/overview.page';
import { PostsPage } from '../../pages/posts.page';
import { StudioPage } from '../../pages/studio.page';

const contentLoopPost = generateMockPost({
  createdAt: '2025-02-18T09:00:00.000Z',
  description: 'Draft a publishable post from this winning concept.',
  id: 'post-core-loop-001',
  label: 'Core Loop Draft',
  platform: 'twitter',
  scheduledDate: '2025-02-20T10:30:00.000Z',
  status: 'scheduled',
  updatedAt: '2025-02-18T09:30:00.000Z',
});

const failedPost = generateMockPost({
  createdAt: '2025-02-21T08:00:00.000Z',
  description: 'This publish attempt failed and should stay editable.',
  id: 'post-core-loop-failed',
  label: 'Failed Publish Draft',
  platform: 'twitter',
  scheduledDate: '2025-02-22T14:15:00.000Z',
  status: 'failed',
  updatedAt: '2025-02-21T08:30:00.000Z',
});

test.describe('Core Content Loop', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandIdentityDefaults(authenticatedPage);
    await mockAnalyticsData(authenticatedPage);
    await mockPostsList(authenticatedPage, [contentLoopPost, failedPost]);
  });

  test('workspace overview exposes the core operator entry points', async ({
    authenticatedPage,
  }) => {
    const overviewPage = new OverviewPage(authenticatedPage);

    await overviewPage.goto('/workspace/overview');

    await expect(overviewPage.mainContent).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Workspace Dashboard' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Operator tools' }),
    ).toBeVisible();
    // Operator-tool links are brand-scoped via useOrgUrl().href(), e.g.
    // `/{orgSlug}/{brandSlug}/studio/image`, so assert on the route suffix
    // rather than a bare path. "Open Inbox" is an unscoped literal Link.
    await expect(
      authenticatedPage.getByRole('link', { name: 'Studio Image' }),
    ).toHaveAttribute('href', /\/studio\/image$/);
    await expect(
      authenticatedPage.getByRole('link', { name: 'Open Inbox' }),
    ).toHaveAttribute('href', '/workspace/inbox/unread');
    await expect(
      authenticatedPage.getByRole('link', { name: 'Workflows' }),
    ).toHaveAttribute('href', /\/workflows$/);
  });

  test('studio supports content-type switching and prompt entry', async ({
    authenticatedPage,
  }) => {
    const studioPage = new StudioPage(authenticatedPage);

    await mockImageGenerationSuccess(authenticatedPage, {
      delay: 0,
      finalStatus: 'completed',
    });

    await studioPage.gotoGenerationType('image');

    await expect(authenticatedPage).toHaveURL(/\/studio\/image/);
    await expect(
      studioPage.promptInput.or(studioPage.promptTextarea),
    ).toBeVisible();

    if (
      await studioPage.videoTab
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      await studioPage.videoTab.first().click();
      await expect(authenticatedPage).toHaveURL(/\/studio\/video/);
      await studioPage.imageTab.first().click();
      await expect(authenticatedPage).toHaveURL(/\/studio\/image/);
    }

    await studioPage.enterPrompt(
      'Create a launch-ready product still with soft shadows.',
    );

    await expect(authenticatedPage).toHaveURL(/\/studio\/image/);
    await expect(
      studioPage.promptInput.or(studioPage.promptTextarea),
    ).toHaveValue('Create a launch-ready product still with soft shadows.');
    await expect(studioPage.generateButton.first()).toBeVisible();
  });

  test('post detail keeps failed publishing state visible and reviewable', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostDetail(authenticatedPage, failedPost);
    await postsPage.gotoPostDetail(String(failedPost.id));

    await expect(authenticatedPage).toHaveURL(/\/posts\/post-core-loop-failed/);
    await expect(
      authenticatedPage.getByText('Publication Failed'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Scheduled Time' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('textbox', { name: 'Date' }),
    ).toBeVisible();
  });

  test('review, calendar, and analytics routes render the core loop surfaces', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);
    const analyticsPage = new AnalyticsPage(authenticatedPage);

    await mockReviewQueue(authenticatedPage, {
      postId: String(contentLoopPost.id),
    });
    await postsPage.gotoReview();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Publishing Inbox' }),
    ).toBeVisible();

    await mockCalendarPosts(authenticatedPage, [contentLoopPost]);
    await postsPage.gotoCalendar();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Calendar' }),
    ).toBeVisible();

    await analyticsPage.goto();
    await expect(analyticsPage.mainContent).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Top Posts' }),
    ).toBeVisible();

    await authenticatedPage.goto(
      `/analytics/posts?postId=${String(contentLoopPost.id)}`,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Top Posts' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(
        'Focused on a single post from the loop. Open the post detail to remix, or ask the agent for the next step.',
      ),
    ).toBeVisible();
  });
});
