import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

/**
 * Studio's standalone one-off generation tabs (image / video / avatar / music)
 * are retired — the Agent owns one-off media generation and Studio keeps only
 * the production surfaces (storyboard, clips, batch, fastlane).
 *
 * These tests guard the retirement contract: no orphan routes are left behind.
 * Every retired tab lands on the Agent, every retired asset detail path lands in
 * the Library, and the Studio root lands on its first production surface.
 *
 * @see apps/app/next.config.ts — retiredStudioTabRedirects()
 */

const BRAND_BASE = '/test-org/brand-1';
const RETIRED_TABS = ['image', 'images', 'video', 'videos', 'music', 'avatar'];

test.describe('Retired Studio one-off tabs', () => {
  test.setTimeout(90_000);

  for (const tab of RETIRED_TABS) {
    test(`/studio/${tab} hands off to the Agent`, async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${BRAND_BASE}/studio/${tab}`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${BRAND_BASE}/agent/new`),
      );
      await expectNoErrorOverlay(authenticatedPage);
    });

    test(`/studio/${tab}/:assetId hands off to the Library`, async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`${BRAND_BASE}/studio/${tab}/asset-1`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${BRAND_BASE}/library`),
      );
      await expectNoErrorOverlay(authenticatedPage);
    });
  }

  test('the Studio root lands on the storyboard surface', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(`${BRAND_BASE}/studio`, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${BRAND_BASE}/studio/storyboard`),
    );
    await expectNoErrorOverlay(authenticatedPage);
  });
});
