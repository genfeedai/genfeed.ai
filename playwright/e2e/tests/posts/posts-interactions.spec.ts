import {
  generateMockPost,
  mockNewslettersList,
  mockPostsList,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertHealthy, settle } from '../../utils/interaction-helpers';
import { tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the Posts surface.
 *
 * Exercises list status filters, search, view toggles, post detail,
 * calendar navigation, review queue, remix, newsletters, and analytics.
 *
 * All API + auth + Better Auth traffic is mocked by the authenticatedPage fixture;
 * the strict network guard fails on any real outbound request. Interactions
 * are best-effort (tryClick never throws, clicks are .catch-guarded) so the
 * specs raise code coverage without becoming brittle.
 */

const PUBLISHING_BASE = '/test-org/brand-1/publishing';
const POSTS_ROUTE = `${PUBLISHING_BASE}/posts`;
const DRAFTS_ROUTE = `${POSTS_ROUTE}?publicationState=not-posted`;
const ANALYTICS_POSTS_ROUTE = '/test-org/brand-1/analytics/posts';

test.describe('Posts — deep interactions', () => {
  test.setTimeout(90_000);

  test('drafts list renders and search input accepts input', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(DRAFTS_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const search = authenticatedPage
      .locator('input[placeholder*="search" i], input[type="search"]')
      .first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('launch').catch(() => {});
      await settle(authenticatedPage);
    }

    await assertHealthy(authenticatedPage);
  });

  test('navigates status filters through canonical routes', async ({
    authenticatedPage,
  }) => {
    // `/publishing/scheduled` and `/publishing/published` are not real
    // routes -- there is no dedicated path per lifecycle state, only the
    // unified Posts desk with a `publicationState`/`status` query filter
    // (createPublishingPostsFilterRoute). A stale destination 404s, which
    // keeps the requested URL and renders a legitimate (healthy-looking)
    // not-found page, so this loop was passing vacuously. See #5381.
    for (const destination of ['not-posted', 'posted']) {
      await authenticatedPage.goto(
        `${POSTS_ROUTE}?publicationState=${destination}`,
        { waitUntil: 'domcontentloaded' },
      );
      await settle(authenticatedPage);
      await expect(authenticatedPage).toHaveURL(
        new RegExp(`publicationState=${destination}$`),
      );
      await assertHealthy(authenticatedPage);
    }

    await authenticatedPage.goto(DRAFTS_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage);
  });

  test('clicks tab links and refresh control on the list', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(DRAFTS_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await tryClick(authenticatedPage, '[role="tab"]:has-text("Scheduled")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]:has-text("Published")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]:has-text("Drafts")');
    await settle(authenticatedPage);

    await tryClick(authenticatedPage, 'button[aria-label*="refresh" i]');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('toggles view modes and opens filters on the list', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(DRAFTS_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await tryClick(authenticatedPage, 'button:has-text("Table View")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button:has-text("Card View")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button:has-text("Filters")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('platform query filter keeps the list healthy', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${POSTS_ROUTE}?platform=twitter`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/platform=twitter/);
    await assertHealthy(authenticatedPage);
  });

  test('opens a post detail route', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`${POSTS_ROUTE}/mock-id`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/publishing\/posts\/mock-id/);

    // Exercise any detail tabs / action buttons that render.
    await tryClick(authenticatedPage, '[role="tab"]');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button:has-text("Edit")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('calendar renders and navigation controls are clickable', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${PUBLISHING_BASE}/calendar`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // Month / week navigation arrows.
    await tryClick(authenticatedPage, 'button[aria-label*="next" i]');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button[aria-label*="prev" i]');
    await settle(authenticatedPage);

    // Switch between post and article views via the filter controls.
    await tryClick(authenticatedPage, 'a[href*="compose"]');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('review queue renders and filter / batch controls respond', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${PUBLISHING_BASE}/review`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await authenticatedPage.goto(`${PUBLISHING_BASE}/review?filter=approved`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/filter=approved/);

    await tryClick(authenticatedPage, 'button:has-text("All")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('remix route renders for tweet and thread modes', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${PUBLISHING_BASE}/remix?topic=launch&mode=tweet`,
      {
        waitUntil: 'domcontentloaded',
      },
    );
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage);

    await authenticatedPage.goto(
      `${PUBLISHING_BASE}/remix?topic=launch&mode=thread`,
      { waitUntil: 'domcontentloaded' },
    );
    await settle(authenticatedPage);

    // Error fallback exposes recovery buttons; exercise them if present.
    await tryClick(authenticatedPage, 'button:has-text("Go to Drafts")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('content library filters to newsletters and search narrows results', async ({
    authenticatedPage,
  }) => {
    // A dedicated `/publishing/newsletters` desk no longer exists (404s) --
    // newsletters are a `type=newsletter` filter on the unified Posts
    // content library toolbar now. See #5381.
    //
    // Seeds a matching and a non-matching newsletter, plus a post (a
    // different content type) whose label also matches the search term --
    // proving the type filter and the search narrow together (AND), not
    // that search alone happens to return something.
    await mockNewslettersList(authenticatedPage, [
      {
        id: 'newsletter-match-001',
        label: 'Weekly Roundup',
        summary: 'This week in review',
      },
      {
        id: 'newsletter-nomatch-001',
        label: 'Product Launch Newsletter',
        summary: 'Announcing the new release',
      },
    ]);
    await mockPostsList(authenticatedPage, [
      generateMockPost({
        description: 'Not a newsletter',
        id: 'post-nomatch-001',
        label: 'Weekly Standup Post',
      }),
    ]);

    await authenticatedPage.goto(POSTS_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await authenticatedPage
      .locator('button[role="combobox"][aria-label="Content type"]')
      .click();
    await authenticatedPage
      .getByRole('option', { name: 'Newsletters', exact: true })
      .click();
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/type=newsletter/);

    await expect(authenticatedPage.getByText('Weekly Roundup')).toBeVisible();
    await expect(
      authenticatedPage.getByText('Product Launch Newsletter'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Weekly Standup Post'),
    ).toHaveCount(0);

    const search = authenticatedPage.locator(
      'input[placeholder*="Search posts" i]',
    );
    await expect(search).toBeVisible();
    await search.fill('weekly');
    await settle(authenticatedPage);

    await expect(authenticatedPage.getByText('Weekly Roundup')).toBeVisible();
    await expect(
      authenticatedPage.getByText('Product Launch Newsletter'),
    ).toHaveCount(0);
    await expect(
      authenticatedPage.getByText('Weekly Standup Post'),
    ).toHaveCount(0);

    await assertHealthy(authenticatedPage);
  });

  test('the new-post menu opens the newsletter composer modal', async ({
    authenticatedPage,
  }) => {
    // Newsletter creation is a modal (`ModalEnum.NEWSLETTER`) opened from
    // the "New post" menu, not a page of its own. See #5381.
    await authenticatedPage.goto(POSTS_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await authenticatedPage
      .getByRole('button', { name: 'New post', exact: true })
      .click();
    await authenticatedPage
      .getByRole('menuitem', { name: 'Newsletter', exact: true })
      .click();
    await settle(authenticatedPage);

    await expect(authenticatedPage.getByRole('dialog')).toBeVisible();
    await assertHealthy(authenticatedPage);
  });

  test('posts analytics page renders', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(ANALYTICS_POSTS_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/analytics\/posts/);

    await tryClick(authenticatedPage, '[role="tab"]');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });
});
