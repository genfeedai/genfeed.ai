import { defineConfig, devices } from '@playwright/test';

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
 * CRITICAL: Tests use API interceptors to mock all responses.
 * No real AI generation, billing, or external service calls occur during tests.
 *
 * @see https://playwright.dev/docs/test-configuration
 */

const isCI = !!process.env.CI;
const shouldSkipWebServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1';
const appBaseURL =
  process.env.APP_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:3102';
const adminBaseURL = process.env.ADMIN_BASE_URL || 'http://127.0.0.1:3101';
const appWebServerUrl =
  process.env.PLAYWRIGHT_WEB_SERVER_URL || `${appBaseURL}/playwright-ready`;
const adminWebServerUrl =
  process.env.PLAYWRIGHT_ADMIN_WEB_SERVER_URL ||
  `${adminBaseURL}/playwright-ready`;
const appWebAppPath = process.env.PLAYWRIGHT_WEB_APP_PATH || 'apps/app';
const adminWebAppPath =
  process.env.PLAYWRIGHT_ADMIN_WEB_APP_PATH || 'apps/admin';
const testApiEndpoint =
  process.env.NEXT_PUBLIC_API_ENDPOINT || 'http://local.genfeed.ai:3001/v1';
const appPlaywrightWebServerEnv = {
  ...process.env,
  NEXT_PUBLIC_API_ENDPOINT: testApiEndpoint,
  NEXT_PUBLIC_APPS_APP_ENDPOINT:
    process.env.NEXT_PUBLIC_APPS_APP_ENDPOINT || 'http://localhost:3102',
  NEXT_PUBLIC_PLAYWRIGHT_TEST:
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST || 'true',
  NEXT_PUBLIC_WS_ENDPOINT:
    process.env.NEXT_PUBLIC_WS_ENDPOINT || 'http://local.genfeed.ai:3007',
  PLAYWRIGHT_TEST: 'true',
};
const adminPlaywrightWebServerEnv = {
  ...process.env,
  NEXT_PUBLIC_API_ENDPOINT:
    process.env.NEXT_PUBLIC_API_ENDPOINT || 'http://local.genfeed.ai:3001/v1',
  NEXT_PUBLIC_PLAYWRIGHT_TEST:
    process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST || 'true',
  NEXT_PUBLIC_WS_ENDPOINT:
    process.env.NEXT_PUBLIC_WS_ENDPOINT || 'http://local.genfeed.ai:3007',
  PLAYWRIGHT_TEST: 'true',
};
const appCiWebServerCommand =
  process.env.PLAYWRIGHT_APP_COMMAND_CI ||
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND_CI ||
  `bun run --cwd ${appWebAppPath} start -- --hostname 127.0.0.1`;
const adminCiWebServerCommand =
  process.env.PLAYWRIGHT_ADMIN_COMMAND_CI ||
  process.env.PLAYWRIGHT_ADMIN_WEB_SERVER_COMMAND_CI ||
  `bun run --cwd ${adminWebAppPath} start -- --hostname 127.0.0.1`;
const appDevWebServerCommand =
  process.env.PLAYWRIGHT_APP_COMMAND ||
  process.env.PLAYWRIGHT_WEB_SERVER_COMMAND ||
  `bun run --cwd ${appWebAppPath} dev -- --hostname 127.0.0.1`;
const adminDevWebServerCommand =
  process.env.PLAYWRIGHT_ADMIN_COMMAND ||
  process.env.PLAYWRIGHT_ADMIN_WEB_SERVER_COMMAND ||
  `bun run --cwd ${adminWebAppPath} dev -- --hostname 127.0.0.1`;
const cliArgs = process.argv.slice(2);
const includesExplicitTestPaths = cliArgs.some((arg) =>
  arg.startsWith('e2e/tests/'),
);
const includesAdminTarget = cliArgs.some(
  (arg, index) =>
    arg.includes('/admin/') ||
    arg === 'admin-core' ||
    arg === '--project=admin-core' ||
    (arg === '--project' && cliArgs[index + 1] === 'admin-core'),
);
const shouldIncludeAdminWebServer =
  process.env.PLAYWRIGHT_INCLUDE_ADMIN_SERVER === 'true' ||
  includesAdminTarget ||
  !includesExplicitTestPaths;

export default defineConfig({
  expect: {
    timeout: 60000, // Dev-route content can take longer to hydrate in this app
    toHaveScreenshot: {
      maxDiffPixels: 100,
      threshold: 0.2,
    },
  },
  forbidOnly: isCI,

  // Test execution settings
  fullyParallel: true,

  // Global setup - runs once before all tests
  globalSetup: './e2e/global-setup.ts',

  // Output directories
  outputDir: 'playwright-results',

  // Test project configurations
  projects: [
    {
      name: 'app-core',
      testIgnore: [
        /admin\/.+\.spec\.ts/,
        /marketplace\/.+\.spec\.ts/,
        /website\/.+\.spec\.ts/,
      ],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: appBaseURL,
        launchOptions: {
          args: ['--disable-web-security'], // For API mocking
        },
      },
    },
    {
      name: 'admin-core',
      testMatch: /admin\/.+\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: adminBaseURL,
        launchOptions: {
          args: ['--disable-web-security'],
        },
      },
    },
  ],

  // Reporter configuration
  reporter: [
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'playwright-report/results.json' }],
    ['junit', { outputFile: 'playwright-report/junit.xml' }],
    isCI ? ['github'] : ['list'],
  ],
  retries: isCI ? 2 : 0,

  // Snapshot configuration
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}{ext}',
  // Test directory structure
  testDir: './e2e/tests',
  testMatch: /e2e\/tests\/.+\.spec\.ts/,
  timeout: 120000, // Give slow dev-route compiles room to settle

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
          ...(shouldIncludeAdminWebServer
            ? [
                {
                  command: adminCiWebServerCommand,
                  env: adminPlaywrightWebServerEnv,
                  reuseExistingServer: true,
                  timeout: 300_000,
                  url: adminWebServerUrl,
                },
              ]
            : []),
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
          ...(shouldIncludeAdminWebServer
            ? [
                {
                  command: adminDevWebServerCommand,
                  env: adminPlaywrightWebServerEnv,
                  reuseExistingServer: true,
                  stderr: 'pipe',
                  stdout: 'pipe',
                  timeout: 300_000,
                  url: adminWebServerUrl,
                },
              ]
            : []),
        ],
  workers: 1,
});
