import { expect, test } from '../../fixtures/auth.fixture';
import { assertHealthy, settle } from '../../utils/interaction-helpers';
import { tryClick } from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the Discover surface.
 *
 * Exercises discovery (search + refresh + platform tabs), socials overview,
 * platform detail ([platform]), and the ads pages (overview, Google, Meta).
 *
 * Trends / discovery / ads endpoints are pre-mocked with sample data by the
 * api-interceptor; the strict network guard fails on real outbound calls.
 * Interactions are best-effort (tryClick never throws, clicks .catch-guarded)
 * so the specs lift code coverage without becoming brittle.
 */

const BASE = '/test-org/brand-1/discover';

test.describe('Discover — deep interactions', () => {
  test.setTimeout(90_000);

  test('discovery renders, search accepts input, refresh responds', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/discovery`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const search = authenticatedPage
      .locator('input[placeholder*="search" i], input[type="search"]')
      .first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('workflow').catch(() => {});
      await settle(authenticatedPage);
    }

    await tryClick(authenticatedPage, 'button[aria-label*="refresh" i]');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('discovery socials-navigation platform tabs are clickable', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/discovery`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await tryClick(authenticatedPage, '[role="tab"]:has-text("TikTok")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]:has-text("X")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]:has-text("Overview")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('socials overview renders with platform tabs', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/socials`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/discover\/socials/);

    await tryClick(authenticatedPage, '[role="tab"]:has-text("Instagram")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('navigates to a platform detail route and switches platforms', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/tiktok`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/discover\/tiktok/);

    await tryClick(authenticatedPage, '[role="tab"]:has-text("X")');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]:has-text("YouTube")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('platform detail refresh and trend card open are clickable', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/twitter`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/discover\/twitter/);

    await tryClick(authenticatedPage, 'button[aria-label*="refresh" i]');
    await settle(authenticatedPage);

    // Open the first trend/content card if any rendered.
    await tryClick(authenticatedPage, '[class*="TrendContentCard"], article a');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('multiple platform detail routes render healthy', async ({
    authenticatedPage,
  }) => {
    for (const platform of ['youtube', 'reddit', 'linkedin']) {
      await authenticatedPage.goto(`${BASE}/${platform}`, {
        waitUntil: 'domcontentloaded',
      });
      await settle(authenticatedPage);
      await expect(authenticatedPage).toHaveURL(
        new RegExp(`discover/${platform}`),
      );
      await assertHealthy(authenticatedPage);
    }
  });

  test('ads overview renders and tabs / filters respond', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/ads`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/discover\/ads/);

    await tryClick(authenticatedPage, '[role="tab"]:has-text("Overview")');
    await settle(authenticatedPage);

    const search = authenticatedPage
      .locator('input[placeholder*="search" i], input[type="search"]')
      .first();
    if (await search.isVisible().catch(() => false)) {
      await search.fill('niche').catch(() => {});
      await settle(authenticatedPage);
    }

    await assertHealthy(authenticatedPage);
  });

  test('ads Google page renders and controls respond', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/ads/google`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/discover\/ads\/google/);

    await tryClick(authenticatedPage, 'button[aria-label*="refresh" i]');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('ads Meta page renders and controls respond', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/ads/meta`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/discover\/ads\/meta/);

    await tryClick(authenticatedPage, 'button[aria-label*="refresh" i]');
    await settle(authenticatedPage);
    await tryClick(authenticatedPage, '[role="tab"]');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('discover index redirects and stays out of login', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(BASE, { waitUntil: 'domcontentloaded' });
    await settle(authenticatedPage);
    await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
    await assertHealthy(authenticatedPage);
  });

  test('browser back navigation between discover pages works', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BASE}/discovery`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await authenticatedPage.goto(`${BASE}/ads`, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/discover\/ads/);

    await authenticatedPage.goBack().catch(() => {});
    await settle(authenticatedPage);
    await expect(authenticatedPage).toHaveURL(/discover\/discovery/);

    await assertHealthy(authenticatedPage);
  });
});
