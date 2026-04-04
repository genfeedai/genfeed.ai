import type { FullConfig } from '@playwright/test';

/**
 * Global Setup for Playwright E2E Tests
 *
 * This file runs once before all tests to set up the testing environment.
 * It ensures consistent state across all test runs.
 *
 * CRITICAL: No real backend calls should be made during setup.
 * All tests use mocked API responses.
 */

async function globalSetup(config: FullConfig): Promise<void> {
  // Log test configuration
  console.log('\n=== Playwright E2E Test Setup ===');
  console.log(
    `Base URL: ${config.projects[0]?.use?.baseURL || 'Not configured'}`,
  );
  console.log(`Workers: ${config.workers}`);
  console.log(`Projects: ${config.projects.map((p) => p.name).join(', ')}`);
  console.log('================================\n');

  // Verify environment variables if needed
  validateEnvironment();

  // Set up any global state
  await setupGlobalState();

  console.log('Global setup completed successfully.\n');
}

/**
 * Validates required environment variables
 */
function validateEnvironment(): void {
  const requiredEnvVars: string[] = [
    // Add any required environment variables here
    // For mocked tests, most aren't required
  ];

  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missingVars.join(', ')}`,
    );
  }

  // Set default test environment variables
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.PLAYWRIGHT_TEST = 'true';

  // Log that test mode is active
  console.log('✓ PLAYWRIGHT_TEST mode enabled - Clerk auth bypass active');
}

/**
 * Sets up any global state needed for tests
 */
async function setupGlobalState(): Promise<void> {
  // Create screenshots directory if it doesn't exist
  const fs = await import('node:fs/promises');
  const path = await import('node:path');

  const screenshotsDir = path.join(
    process.cwd(),
    'playwright-report',
    'screenshots',
  );

  try {
    await fs.mkdir(screenshotsDir, { recursive: true });
  } catch {
    // Directory might already exist
  }

  // Clean up old test artifacts (optional)
  if (process.env.CLEAN_ARTIFACTS === 'true') {
    const resultsDir = path.join(process.cwd(), 'playwright-results');
    try {
      await fs.rm(resultsDir, { force: true, recursive: true });
      console.log('Cleaned up old test artifacts.');
    } catch {
      // Directory might not exist
    }
  }
}

export default globalSetup;
