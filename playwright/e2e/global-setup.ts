import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig): Promise<void> {
  console.log('\n=== Playwright E2E Test Setup ===');
  console.log(
    `Base URL: ${config.projects[0]?.use?.baseURL || 'Not configured'}`,
  );
  console.log(`Workers: ${config.workers}`);
  console.log(`Projects: ${config.projects.map((p) => p.name).join(', ')}`);
  console.log('================================\n');

  configureEnvironment();
  await setupGlobalState();

  console.log('Global setup completed successfully.\n');
}

function configureEnvironment(): void {
  process.env.NODE_ENV ||= 'test';
  process.env.PLAYWRIGHT_TEST = 'true';
  process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST ||= 'true';

  console.log(
    '✓ PLAYWRIGHT_TEST mode enabled - Better Auth auth bypass active',
  );
}

async function setupGlobalState(): Promise<void> {
  const resultsDir = path.join(process.cwd(), 'playwright', 'artifacts');
  const screenshotsDir = path.join(resultsDir, 'screenshots');

  if (process.env.CLEAN_ARTIFACTS === 'true') {
    await rm(resultsDir, { force: true, recursive: true });
    console.log('Cleaned up old test artifacts.');
  }

  await mkdir(screenshotsDir, { recursive: true });
}

export default globalSetup;
