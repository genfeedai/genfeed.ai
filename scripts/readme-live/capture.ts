#!/usr/bin/env bun
/**
 * Capture the README screenshots from a real running self-hosted Genfeed.
 *
 * Nothing is intercepted: the browser talks to the real web app and API. The
 * script signs up a demo account through the real sign-up form, skips
 * onboarding, creates a workflow from a real template, seeds demo posts and an
 * agent conversation into PostgreSQL (`seed.sql`), then shoots 1440x900 frames.
 *
 * Start the stack first (release bundle: `docker compose up -d`), on a fresh
 * volume so the demo account does not exist yet. Then:
 *
 *   bun run readme:capture
 *
 * Env: APP_BASE_URL (default http://localhost:3000), POSTGRES_CONTAINER
 * (default genfeed-selfhosted-postgres), POSTGRES_USER and POSTGRES_DB
 * (default genfeed), PLAYWRIGHT_CHROMIUM_EXECUTABLE (a Chromium binary, when
 * the installed Playwright browsers do not match this repo's version).
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';

const repoRoot = path.resolve(import.meta.dir, '../..');
const outputDir = path.join(repoRoot, 'docs/assets/readme');

/** Reads a script option from the environment; not a turbo task input. */
function envOrDefault(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const appBaseUrl = envOrDefault('APP_BASE_URL', 'http://localhost:3000');
const postgresContainer = envOrDefault(
  'POSTGRES_CONTAINER',
  'genfeed-selfhosted-postgres',
);
const postgresUser = envOrDefault('POSTGRES_USER', 'genfeed');
const postgresDatabase = envOrDefault('POSTGRES_DB', 'genfeed');
const chromiumExecutable =
  envOrDefault('PLAYWRIGHT_CHROMIUM_EXECUTABLE', '') || undefined;

const DEMO_EMAIL = 'demo@genfeed.local';
// Throwaway account on a local container: a fresh password per run keeps a
// credential literal out of the repository.
const DEMO_PASSWORD = `Demo-${randomUUID()}`;
const DEMO_NAME = 'Vincent Demo';
const AGENT_THREAD_ID = 'cmdemothread000000000001';
const SETTLE_MS = 3000;
const WORKFLOW_TEMPLATE_TITLE = /^Research to Content$/i;

function runPsql(args: string[], input?: string): string {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      postgresContainer,
      'psql',
      '-U',
      postgresUser,
      '-d',
      postgresDatabase,
      '-v',
      'ON_ERROR_STOP=1',
      ...args,
    ],
    { encoding: 'utf8', input },
  );

  if (result.status !== 0) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`);
  }

  return result.stdout;
}

async function signUp(page: Page): Promise<void> {
  await page.goto(`${appBaseUrl}/sign-up`, { waitUntil: 'networkidle' });
  await page.getByText('Email & Password').click();
  await page.locator('input[type=email]').waitFor();
  await page.locator('input').first().fill(DEMO_NAME);
  await page.locator('input[type=email]').fill(DEMO_EMAIL);
  await page.locator('input[type=password]').fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Create Account' }).click();
  await page.waitForURL(/\/onboarding\//, { timeout: 60_000 });
}

/** Returns the `<org>/<brand>` path prefix of the demo workspace. */
async function skipOnboarding(page: Page): Promise<string> {
  await page.getByText('Skip Onboarding').first().click();
  await page.getByRole('button', { name: 'Skip Onboarding' }).last().click();
  await page.waitForURL(/\/[^/]+\/[^/]+\/workspace\/overview/, {
    timeout: 60_000,
  });

  const match = /^\/([^/]+)\/([^/]+)\//.exec(new URL(page.url()).pathname);
  if (!match) {
    throw new Error(`Cannot read workspace slugs from ${page.url()}`);
  }

  return `${match[1]}/${match[2]}`;
}

async function createWorkflowFromTemplate(
  page: Page,
  workspace: string,
): Promise<string> {
  await page.goto(`${appBaseUrl}/${workspace}/automation/workflows`, {
    waitUntil: 'networkidle',
  });
  await page.getByText('Templates').first().click();
  // Template cards load in no fixed order, so pick the card by its title: the
  // nearest ancestor of the title that holds a "Use template" button.
  const card = page
    .getByText(WORKFLOW_TEMPLATE_TITLE)
    .first()
    .locator('xpath=ancestor::*[.//button][1]');
  await card.getByRole('button', { name: 'Use Template' }).click();
  // The Templates tab lives at /automation/workflows/templates; wait for the
  // new workflow's own editor route instead.
  await page.waitForURL(
    (url) =>
      /\/automation\/workflows\/[^/]+$/.test(url.pathname) &&
      !url.pathname.endsWith('/templates'),
    { timeout: 60_000 },
  );

  return page.url();
}

function seedDemoContent(workspace: string): void {
  const [orgSlug, brandSlug] = workspace.split('/');
  runPsql(
    [
      '-v',
      `org_slug=${orgSlug}`,
      '-v',
      `brand_slug=${brandSlug}`,
      '-v',
      `demo_email=${DEMO_EMAIL}`,
    ],
    readFileSync(path.join(import.meta.dir, 'seed.sql'), 'utf8'),
  );
}

async function shoot(page: Page, url: string, fileName: string): Promise<void> {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: path.join(outputDir, fileName) });
  process.stdout.write(`wrote docs/assets/readme/${fileName}\n`);
}

async function main(): Promise<void> {
  const browser = await chromium.launch({
    executablePath: chromiumExecutable,
  });
  const context = await browser.newContext({
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    viewport: { height: 900, width: 1440 },
  });
  const page = await context.newPage();

  try {
    await signUp(page);
    const workspace = await skipOnboarding(page);
    const workflowUrl = await createWorkflowFromTemplate(page, workspace);
    seedDemoContent(workspace);

    await shoot(
      page,
      `${appBaseUrl}/${workspace}/agent/${AGENT_THREAD_ID}`,
      'agent-shell.png',
    );
    await shoot(
      page,
      `${appBaseUrl}/${workspace}/publishing/posts`,
      'publishing-desk.png',
    );
    await shoot(page, workflowUrl, 'automation-workflows.png');
  } finally {
    await browser.close();
  }
}

await main();
