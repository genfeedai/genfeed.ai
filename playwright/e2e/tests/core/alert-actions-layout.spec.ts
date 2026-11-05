import type { Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';

const ROUTE = brandPath('/settings/knowledge');
const MESSAGE = 'Knowledge could not be loaded.';

/**
 * Measured on this page: the Retry action fits beside the message down to a
 * 390px-wide viewport and wraps under it from 375px. The shared Alert wraps
 * once its body is narrower than the 12rem message basis, the gap and the
 * action together.
 */
const BESIDE_VIEWPORT_WIDTHS = [1440, 390] as const;
const WRAPPED_VIEWPORT_WIDTH = 375;

async function openFailedKnowledgeSources(
  page: Page,
  colorScheme: 'dark' | 'light',
  width: number,
) {
  await page.emulateMedia({ colorScheme });
  await page.setViewportSize({ height: 900, width });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await page.route('**/knowledge-spaces**', async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
  await page.route('**/knowledge-sources**', async (route) => {
    await route.fulfill({
      json: { errors: [{ detail: 'Knowledge sources unavailable' }] },
      status: 500,
    });
  });

  await page.goto(ROUTE);

  // The shell reports the failed request in its own dialog; dismiss it so
  // the page's alert is reachable.
  await page
    .getByRole('dialog', { name: 'Request failed' })
    .getByRole('button', { name: /close/i })
    .first()
    .click({ timeout: 15_000 })
    .catch(() => undefined);

  const alert = page.getByRole('alert').filter({
    has: page.getByRole('button', { name: 'Retry' }),
  });
  await expect(alert).toBeVisible();
  const retry = alert.getByRole('button', { name: 'Retry' });
  const message = alert.getByText(MESSAGE);
  await expect(retry).toBeVisible();
  await expect(message).toBeVisible();
  const [alertBox, retryBox, messageBox] = await Promise.all([
    alert.boundingBox(),
    retry.boundingBox(),
    message.boundingBox(),
  ]);
  if (!alertBox || !retryBox || !messageBox) {
    throw new Error('The alert, its message and Retry must be laid out.');
  }
  const pageWidth = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  // Retry stays inside the alert and the page never scrolls sideways.
  expect(retryBox.x + retryBox.width).toBeLessThanOrEqual(
    alertBox.x + alertBox.width,
  );
  expect(pageWidth).toBeLessThanOrEqual(width);
  return { alertBox, messageBox, retryBox };
}

/**
 * Error notices share one layout: the shared Alert puts the retry action
 * beside the message in the same row (AlertActions), not in a hand-built flex
 * wrapper, and wraps it under the message when the row is too narrow.
 * Knowledge sources is one of the pages that used to hand-roll it.
 */
for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of BESIDE_VIEWPORT_WIDTHS) {
    test(`alert retry action sits beside the message at ${width}px (${colorScheme})`, async ({
      authenticatedPage,
    }) => {
      const { alertBox, messageBox, retryBox } =
        await openFailedKnowledgeSources(authenticatedPage, colorScheme, width);

      // Right half of the alert, on the message's line, in one compact row.
      expect(retryBox.x).toBeGreaterThan(alertBox.x + alertBox.width / 2);
      expect(retryBox.x).toBeGreaterThanOrEqual(
        messageBox.x + messageBox.width,
      );
      expect(retryBox.y).toBeLessThan(messageBox.y + messageBox.height);
      expect(alertBox.height).toBeLessThan(90);
    });
  }

  test(`alert retry action wraps under the message at ${WRAPPED_VIEWPORT_WIDTH}px (${colorScheme})`, async ({
    authenticatedPage,
  }) => {
    const { messageBox, retryBox } = await openFailedKnowledgeSources(
      authenticatedPage,
      colorScheme,
      WRAPPED_VIEWPORT_WIDTH,
    );

    // On its own line under the message, aligned with the message's start.
    expect(retryBox.y).toBeGreaterThanOrEqual(messageBox.y + messageBox.height);
    expect(Math.abs(retryBox.x - messageBox.x)).toBeLessThanOrEqual(1);
  });
}
