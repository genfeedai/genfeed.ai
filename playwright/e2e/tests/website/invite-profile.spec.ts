import type { Page, Request } from '@playwright/test';
import { expect, test } from '@playwright/test';

/**
 * A lead's locked profile: they open /@:handle/invite/:key without an
 * account, see their brand, what we read from their website and the posts
 * prepared for them, and can ask for the unlock email. The public invite API
 * is mocked; the route, the shared feed and the view and unlock counting are
 * real.
 */
const TOKEN = 'A'.repeat(43);
const INVITE_PATH = `/@acme-invoices/invite/${TOKEN}`;
const UNLOCK = 'Email me the unlock link';

const inviteBody = {
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
      handle: 'acme-invoices',
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

async function mockInviteApi(page: Page): Promise<Request[]> {
  const counted: Request[] = [];
  await page.route('**/public/previews/**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      counted.push(request);
      await route.fulfill({ status: 204 });
      return;
    }
    await route.fulfill({
      body: JSON.stringify(inviteBody),
      contentType: 'application/json',
      status: 200,
    });
  });
  return counted;
}

test.describe('Lead invite: locked profile', () => {
  test('a lead without an account sees their locked profile and prepared posts', async ({
    page,
  }) => {
    await mockInviteApi(page);

    await page.goto(INVITE_PATH, { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { name: 'Acme Invoices' }),
    ).toBeVisible();
    await expect(page.getByText('Warm, plain-spoken')).toBeVisible();
    await expect(
      page.getByText('Invoices should take a minute, not an afternoon.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: UNLOCK })).toBeVisible();
  });

  test('counts the visit once, sends the unlock email, then tells the lead to check their inbox', async ({
    page,
  }) => {
    const counted = await mockInviteApi(page);

    await page.goto(INVITE_PATH, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: UNLOCK }).click();

    await expect(page.getByRole('status')).toContainText('Check your inbox');
    const paths = counted.map((request) => new URL(request.url()).pathname);
    expect(paths.filter((path) => path.endsWith('/view'))).toHaveLength(1);
    expect(paths.filter((path) => path.endsWith('/claim'))).toHaveLength(1);
  });

  test('an unknown, expired or revoked key shows one plain message', async ({
    page,
  }) => {
    await page.route('**/public/previews/**', (route) =>
      route.fulfill({
        body: '{}',
        contentType: 'application/json',
        status: 404,
      }),
    );

    await page.goto(INVITE_PATH, { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', {
        name: 'This invite link is no longer active',
      }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: UNLOCK })).toHaveCount(0);
  });

  test('fits a phone without sideways scrolling', async ({ page }) => {
    await mockInviteApi(page);
    await page.setViewportSize({ height: 844, width: 390 });

    await page.goto(INVITE_PATH, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', { name: 'Acme Invoices' }),
    ).toBeVisible();

    const hasSidewaysScroll = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(hasSidewaysScroll).toBe(false);
  });
});
