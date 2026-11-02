import type { Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';

const ROUTE = brandPath('/settings/knowledge');
const RELOAD_DELAY_MS = 800;

function source(id: string, title: string) {
  return {
    attributes: {
      brandId: 'brand-1',
      isDeleted: false,
      isRefreshEnabled: true,
      isVisible: true,
      kind: 'TEXT',
      purpose: 'BRAND_TRUTH',
      scope: 'brand',
      syncState: 'SYNCED',
      title,
    },
    id,
    type: 'knowledge-source',
  };
}

function version(sourceId: string, text: string) {
  return {
    attributes: {
      isCurrent: true,
      observedAt: '2026-09-06T10:00:00.000Z',
      payload: { text },
      processingError: null,
      processingState: 'READY',
      provenance: {},
      retentionState: 'RETAINED',
      retrievalState: 'FRESH',
      sourceId,
      version: 1,
    },
    id: `${sourceId}-v1`,
    type: 'knowledge-source-version',
  };
}

async function mockKnowledge(page: Page) {
  let listReads = 0;
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await page.route('**/knowledge-spaces**', async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
  await page.route('**/knowledge-sources**', async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.endsWith('/versions')) {
      const sourceId = pathname.split('/').at(-2) ?? '';
      await route.fulfill({
        json: { data: [version(sourceId, `Detail text for ${sourceId}`)] },
      });
      return;
    }
    if (pathname.endsWith('/knowledge-sources')) {
      listReads += 1;
      if (listReads > 1) {
        // Selecting a row reloads the list; make the reload visible.
        await new Promise((resolve) => setTimeout(resolve, RELOAD_DELAY_MS));
      }
      await route.fulfill({
        json: {
          data: [source('source-a', 'Source A'), source('source-b', 'Source B')],
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { errors: [] } });
  });
}

test.describe('Knowledge context sidebar', () => {
  test('switching rows swaps the detail in place without closing the sidebar', async ({
    authenticatedPage: page,
  }) => {
    await page.setViewportSize({ height: 900, width: 1440 });
    await mockKnowledge(page);
    await page.goto(`${ROUTE}?sourceId=source-a`);

    const sidebar = page.getByTestId('context-sidebar');
    const detail = page.getByTestId('knowledge-source-detail');
    await expect(detail).toContainText('Detail text for source-a');

    // Record every moment the rail or the detail leaves the page.
    await page.evaluate(() => {
      const win = window as unknown as { __sidebarGaps: number };
      win.__sidebarGaps = 0;
      new MutationObserver(() => {
        const hasRail = Boolean(
          document.querySelector('[data-testid="context-sidebar"]'),
        );
        const hasDetail = Boolean(
          document.querySelector('[data-testid="knowledge-source-detail"]'),
        );
        if (!hasRail || !hasDetail) win.__sidebarGaps += 1;
      }).observe(document.body, { childList: true, subtree: true });
    });

    await page.getByText('Source B', { exact: true }).first().click();

    await expect(sidebar).toBeVisible();
    await expect(detail).toContainText('Detail text for source-b');
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { __sidebarGaps: number }).__sidebarGaps,
      ),
    ).toBe(0);
  });
});
