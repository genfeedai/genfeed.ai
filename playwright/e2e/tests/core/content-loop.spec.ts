import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  generateMockPost,
  mockActiveSubscription,
  mockAnalyticsData,
  mockBrandIdentityDefaults,
  mockCalendarPosts,
  mockPostDetail,
  mockPostsList,
  mockReviewQueue,
  mockWorkspaceTasks,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { AnalyticsPage } from '../../pages/analytics.page';
import { CalendarPage } from '../../pages/calendar.page';
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
    await mockWorkspaceTasks(authenticatedPage);
  });

  test('workspace overview exposes the canonical workspace shell', async ({
    authenticatedPage,
  }) => {
    const overviewPage = new OverviewPage(authenticatedPage);

    await overviewPage.goto(APP_ROUTES.WORKSPACE.OVERVIEW);

    await expect(overviewPage.mainContent).toBeVisible();
    const breadcrumb = authenticatedPage.getByRole('navigation', {
      name: 'Breadcrumb',
    });
    await expect(breadcrumb).toContainText('Workspace');
    await expect(breadcrumb).toContainText('Overview');

    const sidebar = authenticatedPage.getByTestId('sidebar-shell').first();
    await expect(sidebar).toHaveAttribute(
      'data-shell-current-app',
      'workspace',
    );
    await expect(sidebar).toHaveAttribute(
      'data-shell-section-label',
      'Workspace',
    );
    await expect(sidebar.getByRole('link', { name: 'Inbox' })).toHaveAttribute(
      'href',
      /\/workspace\/inbox$/,
    );
    await expect(sidebar.getByRole('link', { name: 'Tasks' })).toHaveAttribute(
      'href',
      /\/workspace\/tasks$/,
    );
  });

  test('studio storyboard lists saved runs and opens the production modes', async ({
    authenticatedPage,
  }) => {
    const studioPage = new StudioPage(authenticatedPage);

    await studioPage.gotoSurface('storyboard');

    await expect(authenticatedPage).toHaveURL(/\/studio\/storyboard/);
    const breadcrumb = authenticatedPage.getByRole('navigation', {
      name: 'Breadcrumb',
    });
    await expect(breadcrumb).toContainText('Studio');
    await expect(breadcrumb).toContainText('Storyboard');
    await authenticatedPage
      .getByRole('link', { name: 'New storyboard' })
      .click();
    await expect(authenticatedPage).toHaveURL(/\/studio\/storyboard\/new$/);
    await expect(
      authenticatedPage.getByRole('link', { name: 'Pick a source' }),
    ).toHaveAttribute('href', /\/discovery\/overview$/);
    await expect(
      authenticatedPage.getByRole('button', { name: /Frame sequence/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /Scenes/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /Merge videos/i }),
    ).toBeVisible();
  });

  test('post detail keeps failed publishing state visible and reviewable', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await mockPostDetail(authenticatedPage, failedPost);
    await postsPage.gotoPostDetail(String(failedPost.id));

    await expect(authenticatedPage).toHaveURL(
      /\/publishing\/posts\/post-core-loop-failed/,
    );
    // The post route renders the artifact editor shell, not the retired
    // read-only detail panel: the failed state is the status badge beside the
    // title, and scheduling remains editable beneath its canonical heading.
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Failed Publish Draft' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('failed', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Scheduled time' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Date' }),
    ).toBeVisible();
  });

  test('review, calendar, and analytics routes render the core loop surfaces', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);
    const calendarPage = new CalendarPage(authenticatedPage);
    const analyticsPage = new AnalyticsPage(authenticatedPage);

    await mockReviewQueue(authenticatedPage, {
      postId: String(contentLoopPost.id),
    });
    await postsPage.gotoReview();
    // The review queue is batch-scoped: the batch picker is the surface's
    // stable landmark (the old "Batch <id>" heading was retired in #2572).
    await expect(
      authenticatedPage.getByRole('button', { name: 'Select review batch' }),
    ).toBeVisible();

    await mockCalendarPosts(authenticatedPage, [contentLoopPost]);
    await postsPage.gotoCalendar();
    // The calendar is the Posts desk's calendar view
    // (`/publishing/posts?view=calendar`). The topbar breadcrumb owns visible
    // page identity under ADR-CONVERSATION-SHELL-CONTRACTS v3.2, so assert the
    // desk's breadcrumb alongside the canonical URL and the calendar grid.
    await calendarPage.assertPostsTabActive();
    await expect(
      authenticatedPage.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toContainText('Posts');
    await calendarPage.assertCalendarVisible();

    await analyticsPage.goto();
    await expect(analyticsPage.mainContent).toBeVisible();
    // First-run orgs with no connected accounts render the empty overview
    // instead of KPI/leaderboard chrome (QA 2026-09-09).
    await expect(
      authenticatedPage.getByRole('heading', {
        name: /^(Top Posts|Connect accounts to see analytics)$/,
      }),
    ).toBeVisible();

    await authenticatedPage.goto(
      `/analytics/posts?postId=${String(contentLoopPost.id)}`,
    );
    await expect(authenticatedPage).toHaveURL(
      new RegExp(`analytics/posts\\?postId=${String(contentLoopPost.id)}`),
    );
    const postDetail = authenticatedPage.getByRole('dialog', {
      name: 'Post detail',
    });
    await expect(postDetail).toBeVisible();
    await expect(
      postDetail.getByRole('heading', { name: 'Post detail' }),
    ).toBeVisible();
    await expect(
      postDetail.getByRole('button', { name: 'Open page' }),
    ).toBeVisible();
  });
});
