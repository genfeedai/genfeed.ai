import { expect, test } from '@playwright/test';

/**
 * Core integration proof — the spec that actually justifies this whole suite.
 *
 * Hits the LIVE released container's API in LOCAL mode (no Better Auth, no secrets).
 * A single `GET /v1/auth/bootstrap` exercises the entire boot chain:
 *   CombinedAuthGuard injects local-admin (combined-auth.guard.ts) →
 *   Prisma reads the rows SelfHostedSeedService wrote on boot
 *   (self-hosted-seed.service.ts: admin@localhost, org/brand slug "default") →
 *   AuthBootstrapService assembles the payload.
 * So a 200 here with the seeded identity proves auth + DB + migrations + seed
 * are ALL live and wired together — not just that a process is answering.
 *
 * Talks to the API directly on API_BASE_URL (3010), independent of the web app.
 */

const apiBaseURL = process.env.API_BASE_URL || 'http://localhost:3010';

interface BootstrapBrand {
  slug?: string;
}

interface BootstrapBody {
  brands?: BootstrapBrand[];
  currentUser?: { email?: string };
}

test.describe('Released image — API integration (LOCAL mode)', () => {
  test('GET /v1/auth/bootstrap returns the seeded local-admin identity', async ({
    request,
  }) => {
    const response = await request.get(`${apiBaseURL}/v1/auth/bootstrap`);

    expect(
      response.status(),
      'bootstrap must 200 — auth injection + DB + seed all live',
    ).toBe(200);

    const body = (await response.json()) as BootstrapBody;

    // Seeded user proves the guard injected local-admin AND Prisma read the seed.
    expect(
      body.currentUser?.email,
      'bootstrap currentUser must be the seeded admin@localhost',
    ).toBe('admin@localhost');

    // Seeded brand proves the default org/brand rows exist and serialize.
    const brandSlugs = (body.brands ?? []).map((brand) => brand.slug);

    expect(
      brandSlugs,
      'bootstrap must include the seeded default brand',
    ).toContain('default');
  });

  test('GET /v1/auth/bootstrap/overview returns 200', async ({ request }) => {
    const response = await request.get(
      `${apiBaseURL}/v1/auth/bootstrap/overview`,
    );

    expect(response.status(), 'bootstrap/overview must 200 in LOCAL mode').toBe(
      200,
    );
  });
});
