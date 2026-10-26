import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const [route = '/', label = 'capture'] = process.argv.slice(2);
const baseURL = process.env.APP_BASE_URL;

if (!baseURL) {
  throw new Error('Set APP_BASE_URL to the live app route (see dev:status).');
}

const storageState = path.join(
  process.cwd(),
  'playwright/artifacts/.better-auth/user.json',
);
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const root =
  process.env.GENFEED_VERIFY_EVIDENCE_DIR ??
  path.join(homedir(), 'genfeed-verify-evidence');
const outDir = path.join(root, stamp);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  baseURL,
  ignoreHTTPSErrors: true,
  storageState,
  viewport: { height: 720, width: 1280 },
});
const page = await context.newPage();
const response = await page.goto(route, {
  timeout: 180_000,
  waitUntil: 'domcontentloaded',
});
await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});

const png = path.join(outDir, `${label}.png`);
await page.screenshot({ path: png });
writeFileSync(
  path.join(outDir, `${label}.json`),
  `${JSON.stringify(
    {
      finalUrl: page.url(),
      status: response?.status() ?? null,
      title: await page.title(),
    },
    null,
    2,
  )}\n`,
);
await browser.close();
process.stdout.write(`${png}\n`);
