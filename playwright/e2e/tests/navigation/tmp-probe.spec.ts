import {
  mockActiveSubscription,
  mockLibraryData,
} from '@e2e/fixtures/api-mocks.fixture';
import { test } from '@e2e/fixtures/auth.fixture';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type { Request } from '@playwright/test';

interface Row {
  start: number;
  end?: number;
  status?: number;
  failure?: string;
  url: string;
  seg?: string;
  pf?: string;
  ct?: string;
}

test('probe prefetch requests', async ({ authenticatedPage: page }, testInfo) => {
  const t0 = Date.now();
  const rows = new Map<Request, Row>();
  page.on('request', (r) => {
    if (!r.url().includes('_rsc=')) return;
    const h = r.headers();
    rows.set(r, {
      pf: h['next-router-prefetch'],
      seg: h['next-router-segment-prefetch'],
      start: Date.now() - t0,
      url: new URL(r.url()).pathname,
    });
  });
  page.on('response', (res) => {
    const row = rows.get(res.request());
    if (row) {
      row.status = res.status();
      row.ct = res.headers()['content-type'];
    }
  });
  page.on('requestfinished', (r) => {
    const row = rows.get(r);
    if (row) row.end = Date.now() - t0;
  });
  page.on('requestfailed', (r) => {
    const row = rows.get(r);
    if (row) row.failure = `${r.failure()?.errorText} @${Date.now() - t0}`;
  });
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await mockLibraryData(page);
  await page.goto(
    createBrandAppRoute('test-org', 'brand-1', APP_ROUTES.LIBRARY.ASSETS),
  );
  await page.waitForTimeout(20_000);
  const lines = [...rows.values()]
    .sort((a, b) => a.start - b.start)
    .map(
      (r) =>
        `${String(r.start).padStart(6)} ${r.end === undefined ? 'PENDING' : `+${r.end - r.start}`} st=${r.status} pf=${r.pf} ${r.ct ?? ''} ${r.failure ?? ''} ${r.url} ${r.seg ?? ''}`,
    );
  const pending = [...rows.values()].filter((r) => r.end === undefined && !r.failure).length;
  console.log(
    `PROBE#${testInfo.repeatEachIndex} total=${rows.size} pending=${pending}\n${lines.join('\n')}\nENDPROBE#${testInfo.repeatEachIndex}`,
  );
});
