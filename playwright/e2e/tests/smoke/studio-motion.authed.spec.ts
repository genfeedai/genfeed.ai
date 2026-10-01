import { expect, test } from '@playwright/test';
import { playwrightApiEndpoint } from '../../config/environment';
import { setupStrictNetworkGuard } from '../../utils/network-guard';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

test('Motion loads under a genuine local Better Auth session without creating paid work', async ({
  page,
  baseURL,
  playwright,
}) => {
  test.setTimeout(600_000);
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
  const currentUserResponse = await page.request.get(
    `${playwrightApiEndpoint}/users/me`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  expect(currentUserResponse.ok()).toBeTruthy();
  const currentUser = (await currentUserResponse.json()) as {
    data: { id: string };
  };
  const bootstrap = (await response.json()) as {
    access?: { brandId?: string; userId?: string };
    currentUser?: { id?: string };
    brands?: Array<{
      id?: string;
      _id?: string;
      slug?: string;
      organization?: { slug?: string };
    }>;
  };
  expect(bootstrap.access?.userId).toBe(currentUser.data.id);
  expect(bootstrap.currentUser?.id).toBe(currentUser.data.id);
  const brand = bootstrap.brands?.find(
    (item) => (item.id ?? item._id) === bootstrap.access?.brandId,
  );
  expect(brand?.slug).toBeTruthy();
  expect(brand?.organization?.slug).toBeTruthy();
  const ownedBrandId = brand?.id ?? brand?._id;
  expect(ownedBrandId).toBeTruthy();
  const foreignContext = await playwright.request.newContext();
  let foreignBrandId: string | undefined;
  try {
    const signup = await foreignContext.post(
      `${playwrightApiEndpoint}/auth/sign-up/email`,
      {
        data: {
          email: `motion-foreign-${crypto.randomUUID()}@genfeed.test`,
          name: 'Motion foreign fixture',
          password: 'e2e-bot-password-1',
        },
      },
    );
    expect(signup.ok()).toBeTruthy();
    const exchange = await foreignContext.get(
      `${playwrightApiEndpoint}/auth/token`,
    );
    expect(exchange.ok()).toBeTruthy();
    const foreignToken = ((await exchange.json()) as { token: string }).token;
    const foreignBootstrapResponse = await foreignContext.get(
      `${playwrightApiEndpoint}/auth/bootstrap`,
      {
        headers: { Authorization: `Bearer ${foreignToken}` },
      },
    );
    expect(foreignBootstrapResponse.ok()).toBeTruthy();
    const foreignBootstrap = (await foreignBootstrapResponse.json()) as {
      access?: { brandId?: string };
    };
    foreignBrandId = foreignBootstrap.access?.brandId;
    expect(foreignBrandId).toBeTruthy();
    expect(foreignBrandId).not.toBe(ownedBrandId);
  } finally {
    await foreignContext.dispose();
  }
  for (const path of ['catalog', 'projects']) {
    const owned = await page.request.get(
      `${playwrightApiEndpoint}/visual-projects/${path}?brandId=${encodeURIComponent(ownedBrandId ?? '')}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(owned.status(), `${path} must be registered and authorized`).toBe(
      200,
    );
    const fallback = await page.request.get(
      `${playwrightApiEndpoint}/visual-projects/${path}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(
      fallback.status(),
      `${path} must authorize the actor's current brand`,
    ).toBe(200);
    for (const deniedBrandId of [foreignBrandId, 'foreign-brand-denied']) {
      const foreign = await page.request.get(
        `${playwrightApiEndpoint}/visual-projects/${path}?brandId=${encodeURIComponent(deniedBrandId ?? '')}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      expect([403, 404]).toContain(foreign.status());
    }
  }
  const networkGuard = await setupStrictNetworkGuard(page, { strict: true });
  const route = `/${brand?.organization?.slug}/${brand?.slug}/studio/motion`;
  const pageResponse = await page.goto(route, {
    timeout: 180_000,
    waitUntil: 'domcontentloaded',
  });
  expect(pageResponse?.status()).toBeLessThan(400);
  expect(page.url()).not.toContain('/login');
  await assertNoErrorBoundaryFallback(page, route);
  await expect(
    page.getByRole('heading', { name: 'Motion', exact: true }).first(),
  ).toBeVisible();
  networkGuard.assertNoBlockedRequests();
});
