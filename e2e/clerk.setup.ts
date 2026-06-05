import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { createClerkClient } from '@clerk/backend';
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from '@clerk/testing/playwright';
import { expect, test as setup } from '@playwright/test';

/**
 * Real-Clerk authentication setup for the E2E smoke suite.
 *
 * Replaces the legacy fully-mocked auth (fake `__session` cookie + Clerk FAPI
 * mock + `__playwright_test` bypass) with a REAL Clerk session, so the suite
 * exercises the genuine `proxy.ts` / clerkMiddleware path instead of relying on
 * a bypass that is disabled in production builds.
 *
 * Flow (per Clerk's Playwright guide):
 *   1. clerkSetup()                  -> wires the testing token for the instance
 *   2. @clerk/backend createUser     -> idempotently provisions a `+clerk_test`
 *      user with the publicMetadata the app's OnboardingGuard expects
 *   3. clerk.signIn()                -> establishes a real session in the browser
 *   4. storageState()                -> persisted under playwright/.clerk for reuse
 *
 * REQUIRES (no mock fallback):
 *   - CLERK_SECRET_KEY              real test-instance secret (sk_test_...)
 *   - CLERK_PUBLISHABLE_KEY (or NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
 *   - E2E_CLERK_USER_PASSWORD       password for the provisioned test user
 * The instance must have email + password sign-in enabled.
 */

const AUTH_DIR = path.join(process.cwd(), 'playwright', '.clerk');
const USER_AUTH_FILE = path.join(AUTH_DIR, 'user.json');
const ADMIN_AUTH_FILE = path.join(AUTH_DIR, 'admin.json');

const MOCK_SECRET = 'test-mock-clerk-key';

const secretKey = process.env.CLERK_SECRET_KEY ?? '';
const publishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
  '';
const testUserPassword = process.env.E2E_CLERK_USER_PASSWORD ?? '';

function assertRealClerkEnv(): void {
  const problems: string[] = [];
  if (!secretKey || secretKey === MOCK_SECRET) {
    problems.push(
      'CLERK_SECRET_KEY is missing or the mock placeholder — a real test-instance secret (sk_test_...) is required.',
    );
  }
  if (!publishableKey || !publishableKey.startsWith('pk_')) {
    problems.push(
      'CLERK_PUBLISHABLE_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing or not a pk_ key.',
    );
  }
  if (!testUserPassword) {
    problems.push(
      'E2E_CLERK_USER_PASSWORD is required to sign the test user in.',
    );
  }
  if (problems.length > 0) {
    throw new Error(
      `Real Clerk E2E auth cannot run:\n - ${problems.join('\n - ')}\n` +
        'Set these on the runner (mac-studio / CI) and re-run.',
    );
  }
}

interface SeedUser {
  authFile: string;
  email: string;
  isSuperAdmin: boolean;
}

const SEED_USERS: SeedUser[] = [
  {
    authFile: USER_AUTH_FILE,
    email: 'e2e.user+clerk_test@genfeed.ai',
    isSuperAdmin: false,
  },
  {
    authFile: ADMIN_AUTH_FILE,
    email: 'e2e.admin+clerk_test@genfeed.ai',
    isSuperAdmin: true,
  },
];

/**
 * Idempotently ensure a `+clerk_test` user exists with the publicMetadata the
 * app expects (organization / brand / user ids + admin flag), so the
 * OnboardingGuard lets the session through to the workspace.
 */
async function ensureClerkUser(seed: SeedUser): Promise<void> {
  const client = createClerkClient({ publishableKey, secretKey });

  const existing = await client.users.getUserList({
    emailAddress: [seed.email],
  });

  const publicMetadata = {
    brand: 'brand-1',
    isOnboardingCompleted: true,
    isSuperAdmin: seed.isSuperAdmin,
    organization: 'mock-org-id-e2e-test',
    user: 'mock-user-id-e2e-test',
  };

  if (existing.data.length > 0) {
    await client.users.updateUser(existing.data[0]!.id, { publicMetadata });
    return;
  }

  await client.users.createUser({
    emailAddress: [seed.email],
    password: testUserPassword,
    publicMetadata,
    skipPasswordChecks: true,
  });
}

setup.beforeAll(() => {
  assertRealClerkEnv();
  mkdirSync(AUTH_DIR, { recursive: true });
});

setup('authenticate clerk sessions', async ({ browser }) => {
  await clerkSetup();

  for (const seed of SEED_USERS) {
    await ensureClerkUser(seed);

    const context = await browser.newContext();
    const page = await context.newPage();

    await setupClerkTestingToken({ page });
    // Sign in from a real app page so window.Clerk (ClerkProvider) is loaded —
    // /playwright-ready is a bare readiness route without the provider.
    await page.goto('/login');
    // emailAddress mode: @clerk/testing mints a backend sign-in token (ticket
    // strategy) with the secret key — bypasses password/bot-detection and waits
    // for window.Clerk.user. Far more reliable than the client password path.
    await clerk.signIn({ emailAddress: seed.email, page });

    // Confirm the session lands somewhere authenticated (not bounced to /login).
    await page.goto('/');
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });

    await context.storageState({ path: seed.authFile });
    await context.close();
  }
});
