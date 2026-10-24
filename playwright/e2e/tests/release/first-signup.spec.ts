import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { APP_ROUTES } from '../../../../packages/contracts/src/constants/routes.constant';

test.describe('Released image — first sign-up through the UI', () => {
  test('a visitor creates the first account with email and password', async ({
    page,
  }) => {
    await page.goto(APP_ROUTES.SIGN_UP, { waitUntil: 'domcontentloaded' });

    // The shipped template has no email provider, so a link could never arrive.
    await expect(
      page.getByRole('link', { name: 'Email & password' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Magic Link' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Email & password' }).click();
    await expect(page).toHaveURL(/\/sign-up\/password(?:\?|$)/);

    await page.getByRole('textbox', { name: /^Name/ }).fill('First Signup');
    await page
      .getByRole('textbox', { name: /^Email/ })
      .fill(`first-signup-${randomUUID()}@example.com`);
    await page.getByLabel(/^Password/).fill(`Signup-${randomUUID()}!`);
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page).toHaveURL(/\/onboarding(?:\/|\?|$)/);
  });
});
