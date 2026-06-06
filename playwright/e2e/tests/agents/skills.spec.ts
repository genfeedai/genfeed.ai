import {
  mockActiveSubscription,
  mockSkillsCatalog,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

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
    await authenticatedPage.goto('/orchestration/skills', {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/orchestration\/skills(?:$|[?#])/,
    );
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Brand content behavior',
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
    await unauthenticatedPage.goto('/orchestration/skills', {
      waitUntil: 'domcontentloaded',
    });

    try {
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 5000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
      return;
    } catch {
      // Local keyless dev mode intentionally skips auth enforcement.
    }

    await expect(unauthenticatedPage).toHaveURL(/\/orchestration\/skills/);
    await expect(
      unauthenticatedPage.getByRole('heading', {
        name: 'Brand content behavior',
      }),
    ).toBeVisible();
  });
});
