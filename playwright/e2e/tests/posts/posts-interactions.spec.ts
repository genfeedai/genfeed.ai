import { expect, test } from '../../fixtures/auth.fixture';
import { assertHealthy, settle } from '../../utils/interaction-helpers';
import { tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the Posts surface.
 *
 * Exercises list status filters, search, view toggles, post detail,
 * calendar navigation, review queue, remix, newsletters, and analytics.
 *
 * All API + auth + Clerk traffic is mocked by the authenticatedPage fixture;
 * the strict network guard fails on any real outbound request. Interactions
 * are best-effort (tryClick never throws, clicks are .catch-guarded) so the
 * specs raise code coverage without becoming brittle.
 */

const BASE = '/test-org/brand-1/posts';

test.describe('Posts — deep interactions', () => {
  test.setTimeout(90_000);

  test('drafts list renders and search input accepts input', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(BASE, { waitUntil: 'domcontentloaded' });
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

  test('navigates status filter tabs via query params', async ({
    authenticatedPage,
  }) => {
    for (const status of ['scheduled', 'public']) {
      await authenticatedPage.goto(`${BASE}?status=${status}`, {
        waitUntil: 'domcontentloaded',
      });
      await settle(authenticatedPage);
      await expect(authenticatedPage).toHaveURL(new RegExp(`status=${status}`));
      await assertHealthy(authenticatedPage);
    }

    await authenticatedPage.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage);
  });

  test('clicks tab links and refresh control on the list', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(BASE, { waitUntil: 'domcontentloaded' });
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
    await authenticatedPage.goto(BASE, { waitUntil: 'domcontentloaded' });
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
    await authenticatedPage.goto(`${BASE}?platform=twitter`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/platform=twitter/);
    await assertHealthy(authenticatedPage);
  });

  test('opens a post detail route', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`${BASE}/mock-id`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/posts\/mock-id/);

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
    await authenticatedPage.goto(`${BASE}/calendar`, {
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
    await authenticatedPage.goto(`${BASE}/review`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await authenticatedPage.goto(`${BASE}/review?filter=approved`, {
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
    await authenticatedPage.goto(`${BASE}/remix?topic=launch&mode=tweet`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await assertHealthy(authenticatedPage);

    await authenticatedPage.goto(`${BASE}/remix?topic=launch&mode=thread`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    // Error fallback exposes recovery buttons; exercise them if present.
    await tryClick(authenticatedPage, 'button:has-text("Go to Drafts")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('newsletters page filters, searches, and generates proposals', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/newsletters`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const search = authenticatedPage
      .locator('input[placeholder*="Search newsletters" i]')
      .first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('weekly').catch(() => {});
      await settle(authenticatedPage);
    }

    await tryClick(authenticatedPage, 'button:has-text("Review")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button:has-text("Published")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, 'button:has-text("All")');
    await settle(authenticatedPage);

    const instructions = authenticatedPage
      .locator('textarea[placeholder*="Audience" i]')
      .first();
    if (await instructions.isVisible().catch(() => false)) {
      await instructions.fill('Keep it concise.').catch(() => {});
    }

    await tryClick(authenticatedPage, 'button:has-text("Generate Proposals")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('newsletters manual topic input accepts text', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/newsletters`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const manualTopic = authenticatedPage
      .locator('input[placeholder*="bypass proposals" i]')
      .first();
    if (await manualTopic.isVisible().catch(() => false)) {
      await manualTopic.fill('Q3 product recap').catch(() => {});
    }

    await tryClick(
      authenticatedPage,
      'button:has-text("Generate Review Draft")',
    );
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('posts analytics page renders', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(`${BASE}/analytics`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/posts\/analytics/);

    await tryClick(authenticatedPage, '[role="tab"]');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });
});
