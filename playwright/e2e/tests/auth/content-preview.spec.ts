import type { Page, Request } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * Claimable preview link: a lead opens /preview/:token without an account,
 * sees their brand and the posts prepared for them, and can start claiming.
 * The public preview API is mocked; the route, the shared feed and the
 * view and claim counting are real.
 */
const TOKEN = 'A'.repeat(43);
const PREVIEW_PATH = `/preview/${TOKEN}`;

const previewBody = {
  data: {
    attributes: {
      brand: {
        audience: ['Freelancers', 'Small agencies'],
        description: 'Invoices that take a minute, not an afternoon.',
        name: 'Acme Invoices',
        primaryColor: '#5a2aa0',
        tone: 'Warm, plain-spoken',
      },
      expiresAt: '2030-11-16T10:00:00.000Z',
      items: [
        {
          id: 'item-1',
          media: [],
          platform: 'twitter',
          text: 'Invoices should take a minute, not an afternoon.',
        },
        {
          id: 'item-2',
          media: [],
          platform: 'instagram',
          text: 'Send your next one in 60 seconds. #invoicing',
        },
      ],
    },
    id: 'preview',
    type: 'public-content-preview',
  },
};

async function mockPreviewApi(page: Page): Promise<Request[]> {
  const counted: Request[] = [];
  await page.route('**/public/previews/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      counted.push(request);
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify(previewBody),
      contentType: 'application/json',
      status: 200,
    });
  });
  return counted;
}

test.describe('Claimable preview link', () => {
  test.setTimeout(60_000);

  test('a lead without an account sees their brand and prepared posts', async ({
    unauthenticatedPage,
  }) => {
    await mockPreviewApi(unauthenticatedPage);

    await unauthenticatedPage.goto(PREVIEW_PATH, {
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).not.toHaveURL(/\/login/);
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Acme Invoices' }),
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByText('Warm, plain-spoken'),
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByText(
        'Invoices should take a minute, not an afternoon.',
      ),
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByText('Send your next one in 60 seconds.', {
        exact: false,
      }),
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('button', { name: 'Claim this content' }),
    ).toBeVisible();
  });

  test('counts the visit once, asks for the claim email, then tells the visitor to check their inbox', async ({
    unauthenticatedPage,
  }) => {
    const counted = await mockPreviewApi(unauthenticatedPage);

    await unauthenticatedPage.goto(PREVIEW_PATH, {
      waitUntil: 'domcontentloaded',
    });
    await unauthenticatedPage
      .getByRole('button', { name: 'Claim this content' })
      .click();

    await expect(unauthenticatedPage.getByRole('status')).toContainText(
      'Check your email',
    );
    const paths = counted.map((request) => new URL(request.url()).pathname);
    expect(paths.filter((path) => path.endsWith('/view'))).toHaveLength(1);
    expect(paths.filter((path) => path.endsWith('/claim'))).toHaveLength(1);
  });

  test('an unknown, expired or revoked link shows one plain message', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.route('**/public/previews/**', (route) =>
      route.fulfill({
        body: '{}',
        contentType: 'application/json',
        status: 404,
      }),
    );

    await unauthenticatedPage.goto(PREVIEW_PATH, {
      waitUntil: 'domcontentloaded',
    });

    await expect(
      unauthenticatedPage.getByRole('heading', {
        name: 'This preview is not available',
      }),
    ).toBeVisible();
    await expect(
      unauthenticatedPage.getByRole('button', { name: 'Claim this content' }),
    ).toHaveCount(0);
  });

  test('fits a phone without sideways scrolling', async ({
    unauthenticatedPage,
  }) => {
    await mockPreviewApi(unauthenticatedPage);
    await unauthenticatedPage.setViewportSize({ height: 844, width: 390 });

    await unauthenticatedPage.goto(PREVIEW_PATH, {
      waitUntil: 'domcontentloaded',
    });
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Acme Invoices' }),
    ).toBeVisible();

    const hasSidewaysScroll = await unauthenticatedPage.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasSidewaysScroll).toBe(false);
  });
});
