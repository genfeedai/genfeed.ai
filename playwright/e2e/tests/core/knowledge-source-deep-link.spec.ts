import type { Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';

const SOURCE_ID = 'offpage-source';
const ROUTE = brandPath('/settings/knowledge');
const SOURCE = {
  attributes: {
    brandId: 'brand-1',
    isDeleted: false,
    isRefreshEnabled: true,
    isVisible: true,
    kind: 'URL',
    purpose: 'BRAND_TRUTH',
    scope: 'brand',
    syncState: 'FAILED',
    title: 'Offpage recovery source',
  },
  id: SOURCE_ID,
  type: 'knowledge-source',
};
const VERSION = {
  attributes: {
    isCurrent: true,
    observedAt: '2026-09-06T10:00:00.000Z',
    payload: { text: 'Authorized recovery evidence.' },
    processingError: 'Recorded fetch failure',
    processingState: 'FAILED',
    provenance: {},
    retentionState: 'RETAINED',
    retrievalState: 'STALE',
    sourceId: SOURCE_ID,
    version: 4,
  },
  id: 'offpage-v4',
  type: 'knowledge-source-version',
};

async function mockKnowledge(page: Page, isDenied = false) {
  const reads: URL[] = [];
  const writes: URL[] = [];
  let isRetried = false;
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await page.route('**/knowledge-spaces**', async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
  await page.route('**/knowledge-sources**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') {
      writes.push(url);
      if (url.pathname.endsWith('/retry')) isRetried = true;
      await route.fulfill({
        json: { data: url.pathname.endsWith('/retry') ? VERSION : SOURCE },
      });
      return;
    }
    reads.push(url);
    if (url.pathname.endsWith(`/knowledge-sources/${SOURCE_ID}`)) {
      await route.fulfill(
        isDenied
          ? {
              status: 403,
              json: { errors: [{ detail: 'PRIVATE_DENIED_SOURCE' }] },
            }
          : { json: { data: SOURCE } },
      );
    } else if (
      url.pathname.endsWith(`/knowledge-sources/${SOURCE_ID}/versions`)
    ) {
      await route.fulfill({
        json: {
          data: [
            isRetried
              ? {
                  ...VERSION,
                  attributes: {
                    ...VERSION.attributes,
                    processingState: 'READY',
                    processingError: null,
                    payload: { text: 'Authorized recovered evidence.' },
                  },
                }
              : VERSION,
          ],
        },
      });
    } else if (url.pathname.endsWith('/knowledge-sources')) {
      await route.fulfill({
        json: {
          data: [
            {
              ...SOURCE,
              id: 'page-source',
              attributes: { ...SOURCE.attributes, title: 'Page source' },
            },
          ],
        },
      });
    } else if (url.pathname.endsWith('/versions')) {
      await route.fulfill({
        json: {
          data: [
            {
              ...VERSION,
              id: 'page-v1',
              attributes: {
                ...VERSION.attributes,
                processingState: 'READY',
                processingError: null,
                sourceId: 'page-source',
              },
            },
          ],
        },
      });
    } else {
      await route.fulfill({ status: 404, json: { errors: [] } });
    }
  });
  return { reads, writes };
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const width of [1440, 390]) {
    test(`Knowledge deep link recovery ${width} ${colorScheme}`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(
        (theme) => localStorage.setItem('theme', theme),
        colorScheme,
      );
      const { reads, writes } = await mockKnowledge(page);
      await page.goto(`${ROUTE}?page=3&view=all&sourceId=${SOURCE_ID}`);
      const detail = page.getByTestId('knowledge-source-detail');
      await expect(detail).toBeVisible();
      await expect(detail).toContainText('Authorized recovery evidence.');
      await expect(detail).toContainText('4');
      await expect(detail).toContainText('Recorded fetch failure');
      expect(writes).toHaveLength(0);
      expect(
        reads.filter((url) =>
          url.pathname.endsWith(`/knowledge-sources/${SOURCE_ID}`),
        ),
      ).toHaveLength(1);
      for (const read of reads)
        expect(read.searchParams.get('brandId')).toBe('brand-1');
      expect(
        reads
          .find((url) => url.pathname.endsWith('/knowledge-sources'))
          ?.searchParams.get('page'),
      ).toBe('3');
      await testInfo.attach(`knowledge-failed-${width}-${colorScheme}`, {
        body: await page.screenshot({ animations: 'disabled', fullPage: true }),
        contentType: 'image/png',
      });
      const check = detail.getByRole('button', { name: 'Check now' });
      await check.focus();
      await expect(check).toBeFocused();
      await page.keyboard.press('Enter');
      await expect
        .poll(() =>
          writes.some(
            (url) =>
              url.pathname.endsWith(`/${SOURCE_ID}/refresh`) &&
              url.searchParams.get('brandId') === 'brand-1',
          ),
        )
        .toBe(true);
      await expect
        .poll(
          () =>
            reads.filter((url) =>
              url.pathname.endsWith(`/knowledge-sources/${SOURCE_ID}`),
            ).length,
        )
        .toBe(2);
      await expect(detail).toBeVisible();
      const retry = detail.getByRole('button', { name: 'Retry ingestion' });
      await retry.focus();
      await page.keyboard.press('Enter');
      await expect
        .poll(() =>
          writes.some(
            (url) =>
              url.pathname.endsWith(`/${SOURCE_ID}/retry`) &&
              url.searchParams.get('brandId') === 'brand-1',
          ),
        )
        .toBe(true);
      await expect(detail).toBeVisible();
      await expect(detail).toContainText('Ready');
      await expect(detail).toContainText('Authorized recovered evidence.');
      await expect(
        detail.getByText('Authorized recovered evidence.', { exact: true }),
      ).toBeInViewport({ ratio: 1 });
      await expect(
        detail.getByRole('button', { name: 'Check now' }),
      ).toBeInViewport({ ratio: 1 });
      await testInfo.attach(`knowledge-recovery-${width}-${colorScheme}`, {
        body: await page.screenshot({ animations: 'disabled', fullPage: true }),
        contentType: 'image/png',
      });
      if (width === 390) await page.keyboard.press('Escape');
      else {
        const close = page.getByTestId('context-sidebar-close');
        await close.focus();
        await expect(close).toBeFocused();
        await page.keyboard.press('Enter');
      }
      await expect(detail).not.toBeVisible();
      await expect
        .poll(() => new URL(page.url()).searchParams.has('sourceId'))
        .toBe(false);
      expect(new URL(page.url()).searchParams.get('page')).toBe('3');
      expect(new URL(page.url()).searchParams.get('view')).toBe('all');
      // Navigating to the same source after close opens the current panel again.
      await page.goto(`${ROUTE}?page=3&view=all&sourceId=${SOURCE_ID}`);
      await expect(page.getByTestId('knowledge-source-detail')).toBeVisible();
    });
  }
}

test('denied and unknown Knowledge deep links expose no source evidence', async ({
  authenticatedPage: page,
}) => {
  const { writes } = await mockKnowledge(page, true);
  await page.goto(`${ROUTE}?sourceId=${SOURCE_ID}`);
  await expect(page.getByText('Knowledge could not be loaded.')).toBeVisible();
  await expect(page.getByTestId('knowledge-source-detail')).toHaveCount(0);
  // Next development diagnostics retain console text in a hidden overlay; it must never be presented as source evidence.
  await expect(page.getByText('PRIVATE_DENIED_SOURCE')).not.toBeVisible();
  await expect(page.getByText('Authorized recovery evidence.')).toHaveCount(0);
  await page.goto(`${ROUTE}?sourceId=unknown-source`);
  await expect(page.getByText('Knowledge could not be loaded.')).toBeVisible();
  await expect(page.getByTestId('knowledge-source-detail')).toHaveCount(0);
  expect(writes).toHaveLength(0);
});
