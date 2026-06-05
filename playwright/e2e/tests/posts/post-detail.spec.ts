import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { testPosts } from '../../fixtures/test-data.fixture';
import { PostsPage } from '../../pages/posts.page';

/**
 * E2E Tests for Post Detail (parameterized /posts/[id])
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify that navigating to a specific post by ID loads correctly.
 */
test.describe('Post Detail — /posts/[id]', () => {
  const post = testPosts[0];

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });

    // Mock post detail endpoint
    await authenticatedPage.route(
      `**/api.genfeed.ai/**/posts/${post.id}**`,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            body: JSON.stringify({
              data: {
                attributes: {
                  category: post.category,
                  createdAt: new Date().toISOString(),
                  description: post.description,
                  label: post.label,
                  platform: post.platform,
                  scheduledDate: post.scheduledDate,
                  status: post.status,
                  totalComments: post.totalComments,
                  totalLikes: post.totalLikes,
                  totalViews: post.totalViews,
                  updatedAt: new Date().toISOString(),
                },
                id: post.id,
                type: 'posts',
              },
            }),
            contentType: 'application/json',
            status: 200,
          });
          return;
        }
        await route.continue();
      },
    );

    // Mock posts list endpoint
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/posts**',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            body: JSON.stringify({
              data: testPosts.map((p) => ({
                attributes: {
                  category: p.category,
                  createdAt: new Date().toISOString(),
                  description: p.description,
                  label: p.label,
                  platform: p.platform,
                  scheduledDate: p.scheduledDate,
                  status: p.status,
                  totalComments: p.totalComments,
                  totalLikes: p.totalLikes,
                  totalViews: p.totalViews,
                  updatedAt: new Date().toISOString(),
                },
                id: p.id,
                type: 'posts',
              })),
              meta: { totalCount: testPosts.length },
            }),
            contentType: 'application/json',
            status: 200,
          });
          return;
        }
        await route.continue();
      },
    );
  });

  test('should load post detail page by ID', async ({ authenticatedPage }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await postsPage.gotoPostDetail(post.id);

    await expect(authenticatedPage).toHaveURL(new RegExp(`posts/${post.id}`));
    await expect(postsPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should not redirect away from post detail', async ({
    authenticatedPage,
  }) => {
    const postsPage = new PostsPage(authenticatedPage);

    await postsPage.gotoPostDetail(post.id);

    const url = authenticatedPage.url();
    expect(url).toContain(`posts/${post.id}`);
    expect(url).not.toContain('/login');
  });

  test('should load a scheduled post detail', async ({ authenticatedPage }) => {
    const scheduledPost = testPosts[1];

    // Mock this specific post's detail endpoint
    await authenticatedPage.route(
      `**/api.genfeed.ai/**/posts/${scheduledPost.id}**`,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            body: JSON.stringify({
              data: {
                attributes: {
                  category: scheduledPost.category,
                  createdAt: new Date().toISOString(),
                  description: scheduledPost.description,
                  label: scheduledPost.label,
                  platform: scheduledPost.platform,
                  scheduledDate: scheduledPost.scheduledDate,
                  status: scheduledPost.status,
                  totalComments: scheduledPost.totalComments,
                  totalLikes: scheduledPost.totalLikes,
                  totalViews: scheduledPost.totalViews,
                  updatedAt: new Date().toISOString(),
                },
                id: scheduledPost.id,
                type: 'posts',
              },
            }),
            contentType: 'application/json',
            status: 200,
          });
          return;
        }
        await route.continue();
      },
    );

    const postsPage = new PostsPage(authenticatedPage);

    await postsPage.gotoPostDetail(scheduledPost.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`posts/${scheduledPost.id}`),
    );
    await expect(postsPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should load a published post detail', async ({ authenticatedPage }) => {
    const publishedPost = testPosts[2];

    // Mock this specific post's detail endpoint
    await authenticatedPage.route(
      `**/api.genfeed.ai/**/posts/${publishedPost.id}**`,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            body: JSON.stringify({
              data: {
                attributes: {
                  category: publishedPost.category,
                  createdAt: new Date().toISOString(),
                  description: publishedPost.description,
                  label: publishedPost.label,
                  platform: publishedPost.platform,
                  scheduledDate: publishedPost.scheduledDate,
                  status: publishedPost.status,
                  totalComments: publishedPost.totalComments,
                  totalLikes: publishedPost.totalLikes,
                  totalViews: publishedPost.totalViews,
                  updatedAt: new Date().toISOString(),
                },
                id: publishedPost.id,
                type: 'posts',
              },
            }),
            contentType: 'application/json',
            status: 200,
          });
          return;
        }
        await route.continue();
      },
    );

    const postsPage = new PostsPage(authenticatedPage);

    await postsPage.gotoPostDetail(publishedPost.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`posts/${publishedPost.id}`),
    );
    await expect(postsPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should render post detail on mobile viewport', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 667, width: 375 });

    const postsPage = new PostsPage(authenticatedPage);

    await postsPage.gotoPostDetail(post.id);

    await expect(authenticatedPage).toHaveURL(new RegExp(`posts/${post.id}`));
  });
});

test.describe('Post Detail — Unauthenticated Access', () => {
  test('should redirect post detail page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(`/posts/${testPosts[0].id}`, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });
});
