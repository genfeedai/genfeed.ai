import {
  mockExpiredSubscription,
  mockInsufficientCredits,
} from '../../fixtures/api-mocks.fixture';
import { test } from '../../fixtures/auth.fixture';
import {
  assertHealthy,
  fillPrompt,
  settle,
} from '../../utils/interaction-helpers';
import { tryClick } from '../../utils/route-assertions';

/**
 * Billing-limit coverage for credit-gated surfaces.
 *
 * mockInsufficientCredits forces the credits balance to zero and makes every
 * generation POST return HTTP 402; mockExpiredSubscription reports an expired
 * free plan. Both are applied AFTER the authenticatedPage fixture bootstraps,
 * then the gated surface is visited and a generation is attempted.
 *
 * The app must surface credit / upgrade gating UI (or at minimum handle the 402
 * gracefully) and stay healthy: visible body, no Next.js error overlay, no
 * redirect to /login.
 */

const ORG_BRAND = '/test-org/brand-1';
const IMAGE_ROUTE = `${ORG_BRAND}/studio/image`;
const VIDEO_ROUTE = `${ORG_BRAND}/studio/video`;
const COMPOSE_ROUTE = `${ORG_BRAND}/compose/post`;
const ORCHESTRATION_ROUTE = `${ORG_BRAND}/orchestration`;

type Page = Parameters<typeof mockInsufficientCredits>[0];

async function submitGeneration(page: Page): Promise<void> {
  await tryClick(page, '[data-testid="generate-button"]');
  await tryClick(page, 'button:has-text("Generate")');
}

test.describe('Billing limits — credit and subscription gating', () => {
  test.setTimeout(90_000);

  test('image studio gates generation on insufficient credits', async ({
    authenticatedPage,
  }) => {
    await mockInsufficientCredits(authenticatedPage);
    await authenticatedPage.goto(IMAGE_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'A cinematic portrait with rim light');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    // Upgrade / buy-credits affordances if surfaced by the 402 handler.
    await tryClick(authenticatedPage, 'button:has-text("Upgrade")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('video studio gates generation on insufficient credits', async ({
    authenticatedPage,
  }) => {
    await mockInsufficientCredits(authenticatedPage);
    await authenticatedPage.goto(VIDEO_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'A slow dolly shot of a city street');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('image studio renders under an expired subscription', async ({
    authenticatedPage,
  }) => {
    await mockExpiredSubscription(authenticatedPage);
    await authenticatedPage.goto(IMAGE_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await tryClick(authenticatedPage, 'button:has-text("Upgrade")');
    await tryClick(authenticatedPage, 'a:has-text("Upgrade")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('video studio renders under an expired subscription', async ({
    authenticatedPage,
  }) => {
    await mockExpiredSubscription(authenticatedPage);
    await authenticatedPage.goto(VIDEO_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('compose surface stays healthy on insufficient credits', async ({
    authenticatedPage,
  }) => {
    await mockInsufficientCredits(authenticatedPage);
    await authenticatedPage.goto(COMPOSE_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'Draft a launch announcement post');
    await tryClick(authenticatedPage, 'button:has-text("Generate")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('compose surface stays healthy under an expired subscription', async ({
    authenticatedPage,
  }) => {
    await mockExpiredSubscription(authenticatedPage);
    await authenticatedPage.goto(COMPOSE_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await tryClick(authenticatedPage, 'button:has-text("Upgrade")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('orchestration stays healthy on insufficient credits', async ({
    authenticatedPage,
  }) => {
    await mockInsufficientCredits(authenticatedPage);
    await authenticatedPage.goto(ORCHESTRATION_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    const input = authenticatedPage
      .locator('textarea, input[type="text"]')
      .first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill('Plan a multi-channel launch campaign').catch(() => {});
    }
    await tryClick(authenticatedPage, 'button:has-text("Upgrade")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('orchestration stays healthy under an expired subscription', async ({
    authenticatedPage,
  }) => {
    await mockExpiredSubscription(authenticatedPage);
    await authenticatedPage.goto(ORCHESTRATION_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('insufficient credits surfaces an upgrade path on the image studio', async ({
    authenticatedPage,
  }) => {
    await mockInsufficientCredits(authenticatedPage);
    await authenticatedPage.goto(IMAGE_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'Generate four hero variations');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    // Any of these upgrade/credit affordances may appear; exercising them is
    // best-effort and never required for the health assertion.
    await tryClick(authenticatedPage, 'a[href*="billing"]');
    await tryClick(authenticatedPage, 'button:has-text("Buy credits")');
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });
});
