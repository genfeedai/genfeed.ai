import { expect, test } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

test('Motion loads under a genuine local Better Auth session without creating paid work', async ({
  page,
  baseURL,
}) => {
  for (const address of [baseURL, playwrightApiEndpoint]) {
    expect(address, 'isolated app/API URL is required').toBeTruthy();
    expect(['localhost', '127.0.0.1', '[::1]']).toContain(
      new URL(address ?? '').hostname,
    );
  }
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
  const token = ((await tokenResponse.json()) as { token: string }).token;
  const response = await page.request.get(
    `${playwrightApiEndpoint}/auth/bootstrap`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.ok()).toBeTruthy();
  const bootstrap = (await response.json()) as {
    access?: { brandId?: string };
    brands?: Array<{
      id?: string;
      _id?: string;
      slug?: string;
      organization?: { slug?: string };
    }>;
  };
  const brand =
    bootstrap.brands?.find(
      (item) => (item.id ?? item._id) === bootstrap.access?.brandId,
    ) ?? bootstrap.brands?.[0];
  expect(brand?.slug).toBeTruthy();
  expect(brand?.organization?.slug).toBeTruthy();
  const ownedBrandId = brand?.id ?? brand?._id;
  expect(ownedBrandId).toBeTruthy();
  for (const path of ['catalog', 'projects']) {
    const owned = await page.request.get(
      `${playwrightApiEndpoint}/visual-projects/${path}?brandId=${encodeURIComponent(ownedBrandId ?? '')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(owned.status(), `${path} must be registered and authorized`).toBe(
      200,
    );
    const foreign = await page.request.get(
      `${playwrightApiEndpoint}/visual-projects/${path}?brandId=foreign-brand-denied`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect([403, 404]).toContain(foreign.status());
  }
  const route = `/${brand?.organization?.slug}/${brand?.slug}/studio/motion`;
  const pageResponse = await page.goto(route);
  expect(pageResponse?.status()).toBeLessThan(400);
  expect(page.url()).not.toContain('/login');
  await assertNoErrorBoundaryFallback(page, route);
  await expect(
    page.getByRole('heading', { name: 'Motion', exact: true }).first(),
  ).toBeVisible();
});
