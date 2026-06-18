import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Local-only: hydrate the Playwright RUNNER process from `apps/app/.env.local`
 * (the developer's Clerk dev instance) when `E2E_AUTHED_LOCAL=1`.
 *
 * Why this exists: `next dev` auto-loads `apps/app/.env.local`, so the web
 * server already sees the Clerk keys. The runner that executes clerk.setup.ts
 * does NOT — it runs from the repo root and only sees its own env. This loader
 * bridges the dev-instance keys (CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
 * into the runner so `clerk-setup` can provision + sign in `+clerk_test` users
 * against the dev instance without any new CI secret.
 *
 * Safety: gated behind an explicit flag (never runs for the mocked `app-core`
 * suite), never overrides an already-set var (so the launching script's
 * NEXT_PUBLIC_PLAYWRIGHT_TEST=false wins), and logs only KEY NAMES — never values.
 */
function loadDevEnvLocal(): void {
  if (process.env.E2E_AUTHED_LOCAL !== '1') {
    return;
  }

  const envPath = path.resolve(process.cwd(), 'apps/app/.env.local');
  if (!fs.existsSync(envPath)) {
    console.warn(
      `[e2e] E2E_AUTHED_LOCAL=1 but ${envPath} not found — clerk-setup will fail with a missing-key error.`,
    );
    return;
  }

  const loaded: string[] = [];
  const raw = fs.readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eq = trimmed.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) {
      continue; // already set (e.g. script-provided) — existing env wins
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
    loaded.push(key);
  }

  if (loaded.length > 0) {
    console.log(
      `[e2e] Loaded ${loaded.length} keys from apps/app/.env.local: ${loaded.join(', ')}`,
    );
  }
}

loadDevEnvLocal();

/**
 * Playwright Configuration for E2E Tests
 *
 * This configuration sets up comprehensive E2E testing for the Genfeed Studio app.
 *
 * Key Features:
 * - All API calls are mocked to prevent real backend operations
 * - Authentication is mocked via Clerk fixtures
 * - Tests run in parallel for faster execution
 * - Multiple browser and device configurations supported
 *
 * CRITICAL: The default `app-core` project uses API interceptors to mock all
 * responses — no real AI generation, billing, or external service calls occur.
 * The opt-in `app-authed` project is the one exception: it provisions and signs
 * in real `+clerk_test` users against a Clerk TEST instance (see
 * playwright/e2e/clerk.setup.ts) so protected routes exercise the genuine
 * clerkMiddleware path. That project is flag-gated in CI (E2E_AUTHED_ENABLED)
 * and never runs as part of the default mocked suite.
 *
 * @see https://playwright.dev/docs/test-configuration
 */

const isCI = !!process.env.CI;
const shouldSkipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const appBaseURL =
  process.env.APP_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3000';
const appWebServerUrl =
  process.env.PLAYWRIGHT_WEB_SERVER_URL || `${appBaseURL}/playwright-ready`;
const playwrightRoot = path.resolve(process.cwd(), 'playwright');
const artifactsRoot = path.join(playwrightRoot, 'artifacts');
const e2eRoot = path.join(playwrightRoot, 'e2e');
const appWebAppPath = path.resolve(
  process.cwd(),
  process.env.PLAYWRIGHT_WEB_APP_PATH || 'apps/app',
);
const testApiEndpoint =
  process.env.NEXT_PUBLIC_API_ENDPOINT || 'http://local.genfeed.ai:3010/v1';
const appPlaywrightWebServerEnv = {
  ...process.env,
  NEXT_PUBLIC_API_ENDPOINT: testApiEndpoint,
  NEXT_PUBLIC_APPS_APP_ENDPOINT:
    process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT || 'http://localhost:3000',
  NEXT_PUBLIC_PLAYWRIGHT_TEST:
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST || 'true',
  NEXT_PUBLIC_WS_ENDPOINT:
    process.env.NEXT_PUBLIC_WS_ENDPOINT || 'http://local.genfeed.ai:3013',
  PLAYWRIGHT_TEST: 'true',
};
// Bind the web server dual-stack (IPv6 `::`, which also serves IPv4 127.0.0.1).
// proxy.ts self-proxies to `localhost`, which resolves to ::1 first; binding
// IPv4-only (127.0.0.1) made every SSR page 500 with ECONNREFUSED ::1:3000.
const appCiWebServerCommand =
  process.env.PLAYWRIGHT_APP_COMMAND_CI ||
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND_CI ||
  `bun run --cwd ${appWebAppPath} start -- --hostname ::`;
const appDevWebServerCommand =
  process.env.PLAYWRIGHT_APP_COMMAND ||
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ||
  `bun run --cwd ${appWebAppPath} dev -- --hostname ::`;

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readNonNegativeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }

  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : fallback;
}

const expectTimeout = readPositiveIntEnv('E2E_EXPECT_TIMEOUT_MS', 60000);
const testTimeout = readPositiveIntEnv('E2E_TEST_TIMEOUT_MS', 120000);
const retryCount =
  process.env.E2E_RETRIES === undefined
    ? isCI
      ? 2
      : 0
    : readNonNegativeIntEnv('E2E_RETRIES', 0);

export default defineConfig({
  expect: {
    timeout: expectTimeout, // Dev-route content can take longer to hydrate in this app
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
    },
  },
  forbidOnly: isCI,

  // Test execution settings
  fullyParallel: true,

  // Global setup - runs once before all tests
  globalSetup: path.join(e2eRoot, 'global-setup.ts'),

  // Global teardown - clears the Turbopack dev cache so it never stockpiles
  globalTeardown: path.join(e2eRoot, 'global-teardown.ts'),

  // Output directories
  outputDir: path.join(artifactsRoot, 'results'),

  // Test project configurations
  projects: [
    // Real-Clerk auth bootstrap: provisions +clerk_test users and writes
    // storageState under playwright/artifacts/.clerk for the authenticated projects.
    // Requires the real test-instance secret (see playwright/e2e/clerk.setup.ts).
    {
      name: 'clerk-setup',
      testDir: e2eRoot,
      testMatch: /clerk\.setup\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: appBaseURL,
      },
    },
    {
      name: 'app-core',
      // app-core mocks auth (fake cookies + Clerk FAPI mock + the
      // __playwright_test bypass) and never establishes a real session. The
      // *.authed.spec.ts smoke runs ONLY under `app-authed`, which supplies a
      // genuine Clerk storageState from clerk-setup. If app-core picked them up
      // it would hit the real clerkMiddleware path with no session and every
      // protected route would bounce to /login. Keep them out of this project.
      testIgnore: [
        /marketplace\/.+\.spec\.ts/,
        /website\/.+\.spec\.ts/,
        /\.authed\.spec\.ts/,
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: appBaseURL,
        launchOptions: {
          args: ['--disable-web-security'], // For API mocking
        },
      },
    },
    // Real-Clerk authenticated smoke: reuses the storageState from clerk-setup
    // so protected routes hit the genuine clerkMiddleware path (no mock bypass).
    // Enable once the real secret is wired; see playwright/e2e/clerk.setup.ts.
    {
      name: 'app-authed',
      dependencies: ['clerk-setup'],
      testMatch: /smoke\/.+\.authed\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: appBaseURL,
        storageState: path.join(artifactsRoot, '.clerk', 'user.json'),
      },
    },
  ],

  // Reporter configuration
  reporter: [
    [
      'html',
      { open: 'never', outputFolder: path.join(artifactsRoot, 'report') },
    ],
    [
      'json',
      { outputFile: path.join(artifactsRoot, 'report', 'results.json') },
    ],
    ['junit', { outputFile: path.join(artifactsRoot, 'report', 'junit.xml') }],
    isCI ? ['github'] : ['list'],
  ],
  retries: retryCount,

  // Snapshot configuration
  snapshotPathTemplate: path.join(
    e2eRoot,
    'tests',
    '__screenshots__',
    '{testFilePath}',
    '{arg}{ext}',
  ),
  // Test directory structure
  testDir: path.join(e2eRoot, 'tests'),
  testMatch: /e2e\/tests\/.+\.spec\.ts/,
  timeout: testTimeout, // Give slow dev-route compiles room to settle

  // Default test settings
  use: {
    // Action timeout
    actionTimeout: 15000,
    // Base URL for the primary frontend app under test
    baseURL: appBaseURL,
    ignoreHTTPSErrors: true,

    // Locale settings
    locale: 'en-US',

    // Navigation timeout
    navigationTimeout: 30000,

    // Geolocation (optional)
    // geolocation: { longitude: -73.935242, latitude: 40.730610 },

    // Permissions
    permissions: ['clipboard-read', 'clipboard-write'],

    // Screenshots on failure
    screenshot: 'only-on-failure',
    timezoneId: 'America/New_York',

    // Capture trace on first retry for debugging
    trace: 'on-first-retry',

    // Video recording on failure
    video: 'retain-on-failure',

    // Browser context options
    viewport: { height: 720, width: 1280 },
  },

  // Web server configuration
  // Canonical mode: Playwright starts or reuses the local servers.
  // Manual-server mode remains available via PLAYWRIGHT_SKIP_WEBSERVER=1.
  webServer: shouldSkipWebServer
    ? undefined
    : isCI
      ? [
          {
            command: appCiWebServerCommand,
            env: appPlaywrightWebServerEnv,
            reuseExistingServer: true,
            timeout: 300_000,
            url: appWebServerUrl,
          },
        ]
      : [
          {
            command: appDevWebServerCommand,
            env: appPlaywrightWebServerEnv,
            reuseExistingServer: true,
            stderr: 'pipe',
            stdout: 'pipe',
            timeout: 300_000,
            url: appWebServerUrl,
          },
        ],
  // 2 workers in CI matches ubuntu-latest (2 vCPU). Fixtures are closure-scoped
  // per page (no shared mutable state), so intra-shard parallelism is safe. Under
  // sharding total concurrency is shardCount × 2. Serial describe blocks (e.g.
  // avatar-library.spec.ts) stay serial within their worker. Local stays auto.
  workers: isCI ? 2 : undefined,
});
