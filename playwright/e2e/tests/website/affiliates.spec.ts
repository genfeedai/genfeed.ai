import { expect, test } from '@playwright/test';

test.describe('Website Affiliates Page', () => {
  test('explains the credit reward and links to the Affiliate Hub', async ({
    page,
  }) => {
    await page.goto('/affiliates', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      /earn credits/i,
      { timeout: 10_000 },
    );
    await expect(page.getByText(/10% in credits/i).first()).toBeVisible();

    const cta = page
      .getByRole('link', { name: /get your affiliate link/i })
      .first();
    await expect(cta).toHaveAttribute('href', /\/settings\/referrals$/);
  });

  test('is listed in the sitemap', async ({ request }) => {
    const response = await request.get('/sitemap.xml');

    expect(response.ok()).toBe(true);
    expect(await response.text()).toContain('/affiliates');
  });
});
