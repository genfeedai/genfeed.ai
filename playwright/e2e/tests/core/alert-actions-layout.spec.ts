import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';

const ROUTE = brandPath('/settings/knowledge');

/**
 * Error notices share one layout: the shared Alert puts the retry action
 * beside the message in the same row (AlertActions), not in a hand-built flex
 * wrapper. Knowledge sources is one of the pages that used to hand-roll it.
 */
for (const colorScheme of ['light', 'dark'] as const) {
  test(`alert retry action sits beside the message (${colorScheme})`, async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.emulateMedia({ colorScheme });
    await authenticatedPage.setViewportSize({ height: 900, width: 1440 });
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await authenticatedPage.route('**/knowledge-spaces**', async (route) => {
      await route.fulfill({ json: { data: [] } });
    });
    await authenticatedPage.route('**/knowledge-sources**', async (route) => {
      await route.fulfill({
        json: { errors: [{ detail: 'Knowledge sources unavailable' }] },
        status: 500,
      });
    });

    await authenticatedPage.goto(ROUTE);

    // The shell reports the failed request in its own dialog; dismiss it so
    // the page's alert is reachable.
    await authenticatedPage
      .getByRole('dialog', { name: 'Request failed' })
      .getByRole('button', { name: /close/i })
      .first()
      .click({ timeout: 15_000 })
      .catch(() => undefined);

    const alert = authenticatedPage.getByRole('alert').filter({
      has: authenticatedPage.getByRole('button', { name: 'Retry' }),
    });
    await expect(alert).toBeVisible();
    const retry = alert.getByRole('button', { name: 'Retry' });
    const [alertBox, retryBox] = await Promise.all([
      alert.boundingBox(),
      retry.boundingBox(),
    ]);
    expect(alertBox).not.toBeNull();
    expect(retryBox).not.toBeNull();
    // Right half of the alert, and the alert is a single compact row.
    expect(retryBox?.x ?? 0).toBeGreaterThan(
      (alertBox?.x ?? 0) + (alertBox?.width ?? 0) / 2,
    );
    expect(alertBox?.height ?? 999).toBeLessThan(90);
  });
}
