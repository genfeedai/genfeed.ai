import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockSkillsCatalog,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

test.describe('Brand Skills settings', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockSkillsCatalog(authenticatedPage);
  });

  test('loads the skills catalog for authenticated users', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.SETTINGS.SKILLS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/settings\/skills(?:$|[?#])/);
    await expect(
      authenticatedPage.getByRole('heading', { name: /Catalog/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('YouTube Script Setup').first(),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /Test With Agent/i }),
    ).toBeVisible();
  });

  test('redirects the legacy Automation skills URL into Settings', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.SKILLS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/settings\/skills(?:$|[?#])/);
  });

  test('redirects unauthenticated users from the skills route', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.SETTINGS.SKILLS, {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/login/, { timeout: 15000 });
    expect(unauthenticatedPage.url()).toMatch(/\/login/);
  });
});
