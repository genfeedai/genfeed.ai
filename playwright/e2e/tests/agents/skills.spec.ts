import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockSkillsCatalog,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { filtersTrigger, openFilterFacet } from '../../utils/filter-menu';

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
      authenticatedPage.getByRole('table', { name: 'Catalog', exact: true }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('YouTube Script Setup').first(),
    ).toBeVisible();
    await authenticatedPage
      .getByText('YouTube Script Setup', { exact: true })
      .click();
    await expect(
      authenticatedPage.getByRole('button', {
        name: 'Open agent',
        exact: true,
      }),
    ).toBeVisible();
  });

  test('search carries the Source, Modality and Stage Filters inside its field', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.SETTINGS.SKILLS), {
      waitUntil: 'domcontentloaded',
    });

    const search = authenticatedPage.getByPlaceholder('Search skills');
    await expect(search).toBeVisible();
    const field = search.locator('xpath=../..');
    await expect(filtersTrigger(field)).toBeVisible();
    await expect(authenticatedPage.getByRole('combobox')).toHaveCount(0);

    await search.fill('YouTube');
    await expect(search).toHaveValue('YouTube');
    await expect(
      authenticatedPage.getByText('YouTube Script Setup').first(),
    ).toBeVisible();

    for (const facet of ['Source', 'Modality', 'Stage']) {
      await openFilterFacet(authenticatedPage, facet, field);
      await authenticatedPage.keyboard.press('Escape');
      await authenticatedPage.keyboard.press('Escape');
    }
  });
});

test.describe('Brand Skills settings — unauthenticated access', () => {
  test('redirects unauthenticated users from the skills route', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.SETTINGS.SKILLS, {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/login/, { timeout: 15000 });
    expect(unauthenticatedPage.url()).toMatch(/\/login/);
  });
});
