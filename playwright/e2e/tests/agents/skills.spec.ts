import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockSkillsCatalog,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

test.describe('Agents Skills', () => {
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
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATE.SKILLS), {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(/\/automate\/skills(?:$|[?#])/);
    await expect(
      authenticatedPage.getByRole('heading', {
        name: /Brand content behavior/i,
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'YouTube Script Setup' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Test in chat' }),
    ).toBeVisible();
  });

  test('redirects unauthenticated users from the skills route', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATE.SKILLS, {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/login/, { timeout: 15000 });
    expect(unauthenticatedPage.url()).toMatch(/\/login/);
  });
});
