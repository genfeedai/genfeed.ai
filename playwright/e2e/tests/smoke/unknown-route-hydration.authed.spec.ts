import { expect, test } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';

/**
 * Unknown paths render the root `not-found` page. For a signed-in user it is
 * reached through the full root layout (providers, theme script, toaster), so a
 * server/client markup difference there surfaces as a React hydration error.
 * Sentry only reports that as a scrubbed Replay "Hydration Error" (no message,
 * no component stack), so this spec reads the unscrubbed console instead.
 */
const HYDRATION_PATTERN =
  /hydration|hydrating|did(?:n't| not) match|Minified React error #(418|423|425)\b/i;

test('unknown paths render the 404 page for a signed-in user without hydration errors', async ({
  page,
}) => {
  test.setTimeout(180_000);

  const cookie = (await page.context().cookies()).find((item) =>
    [
      'better-auth.session_token',
      '__Secure-better-auth.session_token',
    ].includes(item.name),
  );
  expect(cookie, 'real auth setup storage state is required').toBeTruthy();
  const tokenResponse = await page.request.get(
    `${playwrightApiEndpoint}/auth/token`,
    { headers: { cookie: `${cookie?.name}=${cookie?.value}` } },
  );
  expect(tokenResponse.ok()).toBeTruthy();
  const { token } = (await tokenResponse.json()) as { token: string };
  const bootstrapResponse = await page.request.get(
    `${playwrightApiEndpoint}/auth/bootstrap`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(bootstrapResponse.ok()).toBeTruthy();
  const bootstrap = (await bootstrapResponse.json()) as {
    access?: { brandId?: string };
    brands?: Array<{
      id?: string;
      _id?: string;
      slug?: string;
      organization?: { slug?: string };
    }>;
  };
  const brand = bootstrap.brands?.find(
    (item) => (item.id ?? item._id) === bootstrap.access?.brandId,
  );
  expect(brand?.slug).toBeTruthy();
  expect(brand?.organization?.slug).toBeTruthy();

  const errors: string[] = [];
  page.on('pageerror', (error) => {
    if (HYDRATION_PATTERN.test(error.message)) {
      errors.push(`pageerror: ${error.message}`);
    }
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && HYDRATION_PATTERN.test(message.text())) {
      errors.push(`console: ${message.text()}`);
    }
  });

  const unknownPaths = [
    `/${brand?.organization?.slug}/${brand?.slug}/workspace/health`,
    `/${brand?.organization?.slug}/${brand?.slug}/definitely-not-a-route`,
  ];

  for (const path of unknownPaths) {
    await test.step(path, async () => {
      const response = await page.goto(path, {
        timeout: 120_000,
        waitUntil: 'load',
      });
      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole('heading', { name: 'This page wandered off' }),
      ).toBeVisible();
      // Hydration runs after the document load; give React time to settle.
      await page.waitForLoadState('networkidle').catch(() => undefined);
      expect(errors, `Hydration errors on ${path}`).toEqual([]);
    });
  }
});
