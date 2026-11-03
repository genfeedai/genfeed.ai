import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { mockGenerationQuote } from '../../utils/generation-setup';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

// A failed generation in the Playground grid: Inspect, Remove and Reprompt
// share one button style, and "Show details" opens a dialog that shows the
// provider's full error without selecting the card.

const failedId = 'failed-video';
const providerError =
  'Provider returned 503 Service Unavailable. request_id: 4f2a91c0-7b3e-4d8a-9a51-0c6e2b7d1f33. Upstream inference node unavailable; retry after 30s.';

function failedVideo(id: string) {
  return {
    id,
    type: 'ingredients',
    attributes: {
      brandId: 'brand-1',
      organizationId: 'mock-org-id-e2e-test',
      category: 'VIDEO',
      scope: 'USER',
      status: 'FAILED',
      generationError: providerError,
      width: 1280,
      height: 720,
      createdAt: '2026-10-26T08:00:00Z',
      prompt: {
        original:
          'A woman in a grey linen blazer walks through a sunlit studio, slow dolly-in, 35mm, soft window light.',
      },
      metadata: {
        label: id,
        model: 'bytedance/seedance-2.5',
        width: 1280,
        height: 720,
      },
    },
  };
}

async function mountFailedPlayground(page: Page): Promise<void> {
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockGenerationQuote(page);
  await page.route('**/v1/studio-generate-drafts/current**', (route) =>
    route.fulfill({ json: { data: null } }),
  );
  await page.route('**/v1/ingredients**', (route) => {
    const url = new URL(route.request().url());
    if (/\/(posts|children)$/.test(url.pathname))
      return route.fulfill({ json: { data: [] } });
    const id = url.pathname.split('/').at(-1);
    return route.fulfill({
      json:
        id && id !== 'ingredients'
          ? { data: failedVideo(id) }
          : {
              data: [failedVideo(failedId)],
              meta: { page: 1, pageSize: 100, totalCount: 1 },
            },
    });
  });
  await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
    waitUntil: 'domcontentloaded',
  });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1440, height: 1000 },
]) {
  test(`failed card details open in a dialog at ${viewport.width}px`, async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await mountFailedPlayground(page);

    const card = page.getByTestId(`studio-asset-${failedId}`);
    await expect(card).toHaveAttribute('data-asset-media-state', 'failed');
    await card.hover();

    // One style for every action on the card.
    for (const name of [/^Remove/, /^Reprompt/]) {
      const button = card.getByRole('button', { name });
      await expect(button).toHaveClass(/bg-transparent/);
      await expect(button).not.toHaveClass(/border/);
    }

    await card.getByRole('button', { name: 'Show details' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(providerError)).toBeVisible();
    await expect(card).toHaveAttribute('data-selected', 'false');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expectNoErrorOverlay(page);
  });
}
