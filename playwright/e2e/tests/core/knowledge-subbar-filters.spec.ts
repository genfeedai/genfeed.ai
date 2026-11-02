import type { Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath, currentRoute } from '../../utils/app-chrome';

const ROUTE = brandPath('/settings/knowledge');
const RAW_ERROR =
  'Request to https://api.replicate.com/v1/models/nateraw/bge-large-en-v1.5/predictions failed with status 404 Not Found';

function source(id: string, title: string, attributes: object) {
  return {
    attributes: {
      brandId: 'brand-1',
      isDeleted: false,
      isRefreshEnabled: false,
      isVisible: true,
      purpose: 'BRAND_TRUTH',
      scope: 'brand',
      title,
      ...attributes,
    },
    id,
    type: 'knowledge-source',
  };
}

function version(sourceId: string, attributes: object) {
  return {
    attributes: {
      isCurrent: true,
      observedAt: '2026-09-24T09:54:00.000Z',
      payload: null,
      processingError: null,
      processingState: 'READY',
      provenance: {},
      retentionState: 'RETAINED',
      retrievalState: 'ACTIVE',
      sourceId,
      version: 1,
      ...attributes,
    },
    id: `${sourceId}-v1`,
    type: 'knowledge-source-version',
  };
}

const SOURCES = [
  source('page', 'Pricing page', {
    kind: 'URL',
    referenceUrl: 'https://www.brand.example/pricing',
  }),
  source('pdf', 'Media kit', {
    kind: 'DOCUMENT',
    referenceUrl: 'https://brand.example/media-kit.pdf',
  }),
  source('notes', 'Voice notes', { kind: 'TEXT' }),
];
const VERSIONS: Record<string, object> = {
  notes: version('notes', {
    payload: { text: 'We speak plainly and never oversell.' },
    processingError: RAW_ERROR,
    processingState: 'FAILED',
  }),
  page: version('page', {}),
  pdf: version('pdf', {}),
};

async function mockKnowledge(page: Page) {
  await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
  await page.route('**/knowledge-spaces**', async (route) => {
    await route.fulfill({ json: { data: [] } });
  });
  await page.route('**/knowledge-sources**', async (route) => {
    const { pathname } = new URL(route.request().url());
    const versionMatch = pathname.match(
      /\/knowledge-sources\/([^/]+)\/versions$/,
    );
    if (versionMatch) {
      await route.fulfill({ json: { data: [VERSIONS[versionMatch[1]]] } });
    } else if (pathname.endsWith('/knowledge-sources')) {
      await route.fulfill({ json: { data: SOURCES } });
    } else {
      await route.fulfill({ status: 404, json: { errors: [] } });
    }
  });
}

test.describe('Knowledge sub bar', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await mockKnowledge(page);
  });

  test('lists documents and links with search and filters in the sub bar', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(ROUTE);

    const table = page.getByRole('table');
    await expect(table.getByText('Pricing page')).toBeVisible();
    await expect(
      table.getByRole('link', { name: 'Open Pricing page' }),
    ).toHaveText('brand.example/pricing');
    await expect(
      table.getByRole('link', { name: 'Open Media kit' }),
    ).toHaveAttribute('href', 'https://brand.example/media-kit.pdf');
    await expect(table.getByRole('img', { name: 'Document' })).toBeVisible();

    // The tabs that used to sit in the page are gone; search and the Filters
    // menu live in the sub bar.
    await expect(page.getByRole('radio', { name: 'All sources' })).toHaveCount(
      0,
    );
    await expect(page.getByPlaceholder('Search sources')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Filters/ })).toBeVisible();
  });

  test('keeps a failed capture to a badge and explains it in the sidebar', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(`${ROUTE}?status=failed`);

    const table = page.getByRole('table');
    await expect(table.getByText('Voice notes')).toBeVisible();
    await expect(table.getByText('Pricing page')).toHaveCount(0);
    await expect(table.getByText('Failed')).toBeVisible();
    await expect(table.getByText(RAW_ERROR)).toHaveCount(0);

    await table.getByText('Voice notes').click();
    const detail = page.getByTestId('knowledge-source-detail');
    await expect(
      detail.getByText(
        'A processing service was unavailable. Retry in a few minutes.',
      ),
    ).toBeVisible();
    await expect(detail.getByText(RAW_ERROR)).toBeVisible();
  });

  test('filters by type from the Filters menu and stores it in the URL', async ({
    authenticatedPage: page,
  }) => {
    await page.goto(ROUTE);

    await page.getByRole('button', { name: /^Filters/ }).click();
    await page.getByRole('menuitem', { name: /^Type/ }).click();
    await page.getByRole('menuitemradio', { name: 'Document' }).click();

    await expect.poll(() => currentRoute(page)).toContain('type=document');
    const table = page.getByRole('table');
    await expect(table.getByText('Media kit')).toBeVisible();
    await expect(table.getByText('Pricing page')).toHaveCount(0);
  });
});
