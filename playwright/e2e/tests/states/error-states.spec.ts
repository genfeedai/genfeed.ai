import {
  mockNetworkError,
  mockServerError,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { settle } from '../../utils/interaction-helpers';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/**
 * Error-state coverage for the authenticated app surfaces.
 *
 * Each test forces a resource fetch to fail (HTTP 5xx via mockServerError or a
 * dropped connection via mockNetworkError) AFTER the authenticatedPage fixture
 * has finished bootstrapping, then navigates to the target route. The app must
 * degrade gracefully: render a body, avoid the Next.js error overlay, and never
 * bounce back to /login.
 *
 * Error mocks are scoped to resource endpoints only (posts, images, videos,
 * analytics, workflows, agents, Discovery) so auth / bootstrap / users traffic
 * still succeeds and the session stays valid.
 */

const ORG_BRAND = '/test-org/brand-1';

type Page = Parameters<typeof mockServerError>[0];

async function assertHealthy(page: Page, route: string): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expectNoErrorOverlay(page);
  expect(page.url(), `${route} redirected to login`).not.toMatch(/\/login/);
}

test.describe('App surfaces — fetch error states', () => {
  test.setTimeout(90_000);

  test('posts list survives a server error', async ({ authenticatedPage }) => {
    await mockServerError(authenticatedPage, '**/posts**');
    const route = `${ORG_BRAND}/publishing/posts?publicationState=not-posted`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('posts list survives a network error', async ({ authenticatedPage }) => {
    await mockNetworkError(authenticatedPage, '**/posts**');
    const route = `${ORG_BRAND}/publishing/posts?publicationState=not-posted`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('image library survives a server error', async ({
    authenticatedPage,
  }) => {
    await mockServerError(authenticatedPage, '**/images**');
    const route = `${ORG_BRAND}/library/images`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('video library survives a network error', async ({
    authenticatedPage,
  }) => {
    await mockNetworkError(authenticatedPage, '**/videos**');
    const route = `${ORG_BRAND}/library/videos`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('music library survives a server error', async ({
    authenticatedPage,
  }) => {
    await mockServerError(authenticatedPage, '**/musics**');
    const route = `${ORG_BRAND}/library/music`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('analytics survives a server error', async ({ authenticatedPage }) => {
    await mockServerError(authenticatedPage, '**/analytics**');
    const route = `${ORG_BRAND}/analytics`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('analytics survives a network error', async ({ authenticatedPage }) => {
    await mockNetworkError(authenticatedPage, '**/analytics**');
    const route = `${ORG_BRAND}/analytics/posts`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('workflows list survives a server error', async ({
    authenticatedPage,
  }) => {
    await mockServerError(authenticatedPage, '**/workflows**');
    const route = '/automation/workflows';
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('workflows list survives a network error', async ({
    authenticatedPage,
  }) => {
    await mockNetworkError(authenticatedPage, '**/workflows**');
    const route = '/automation/workflows';
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('Automation survives a server error', async ({ authenticatedPage }) => {
    await mockServerError(authenticatedPage, '**/agents**');
    await mockServerError(authenticatedPage, '**/tasks**');
    const route = `${ORG_BRAND}/automation`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('Automation runs survive a network error', async ({
    authenticatedPage,
  }) => {
    await mockNetworkError(authenticatedPage, '**/agents**');
    const route = `${ORG_BRAND}/automation/runs`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('Discovery overview survives a server error', async ({
    authenticatedPage,
  }) => {
    await mockServerError(authenticatedPage, '**/discovery**');
    const route = `${ORG_BRAND}/discovery/overview`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('library image list survives an images server error', async ({
    authenticatedPage,
  }) => {
    // Studio's standalone image tab is retired — generated images land in the
    // Library, which is now the surface that must survive the failure.
    await mockServerError(authenticatedPage, '**/images**');
    const route = `${ORG_BRAND}/library/images`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });

  test('studio batch list survives a network error', async ({
    authenticatedPage,
  }) => {
    await mockNetworkError(authenticatedPage, '**/images**');
    const route = `${ORG_BRAND}/studio/batch`;
    await authenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage, route);
  });
});
