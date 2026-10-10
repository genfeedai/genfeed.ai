import { LibraryShelf } from '@genfeedai/contracts';
import {
  APP_ROUTES,
  createLibraryShelfRoute,
} from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockContentLibrary,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * The Library is one asset browser read along three orthogonal axes: type
 * (chips), shelf (generation state), and folder (where a person filed it).
 * These specs guard the axes staying independent — the regression that keeps
 * biting is one axis silently clearing another.
 */
const BRAND = '/test-org/brand-1';

const brandRoute = (route: string): string => `${BRAND}${route}`;

test.describe('Library', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockLibraryData(authenticatedPage);
    await mockContentLibrary(authenticatedPage, 'videos', 3);
  });

  test('opens the Library Overview at the Library root (#5502)', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      brandRoute(APP_ROUTES.LIBRARY.OVERVIEW),
    );

    await expect(
      authenticatedPage.getByRole('link', { name: 'Review assets' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Assets', exact: true }),
    ).toBeVisible();
  });

  test('lists library places and keeps shelves and trash out of the sidebar', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      brandRoute(APP_ROUTES.LIBRARY.ASSETS),
    );

    const rail = authenticatedPage.getByTestId('desktop-sidebar-rail');

    // #5502: Recent and Starred are a toolbar filter, not navigation.
    for (const label of ['Overview', 'Assets', 'References']) {
      await expect(
        rail.getByRole('link', { name: label, exact: true }),
      ).toBeVisible();
    }
    for (const label of ['Recent', 'Starred', 'Characters']) {
      await expect(rail.getByRole('link', { name: label })).toHaveCount(0);
    }

    await expect(rail.getByText('Shelves')).toHaveCount(0);
    await expect(rail.getByRole('link', { name: 'Trash' })).toHaveCount(0);
    await expect(rail.getByRole('link', { name: 'Unsorted' })).toHaveCount(0);
    await expect(
      authenticatedPage.getByRole('combobox', { name: 'Status' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('combobox', { name: 'Show' }),
    ).toBeVisible();
  });

  test('keeps a shelf selected across a reload', async ({
    authenticatedPage,
  }) => {
    const shelfRoute = brandRoute(
      createLibraryShelfRoute(LibraryShelf.NEEDS_REVIEW),
    );

    await assertRouteRenders(authenticatedPage, shelfRoute);
    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });

    expect(new URL(authenticatedPage.url()).searchParams.get('shelf')).toBe(
      LibraryShelf.NEEDS_REVIEW,
    );
    await expect(authenticatedPage.locator('[data-nextjs-dialog]')).toHaveCount(
      0,
    );
  });

  test('composes the folder and type axes in one URL', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${brandRoute(APP_ROUTES.LIBRARY.ASSETS)}?folder=folder-1&categories=VIDEO`,
    );

    const url = new URL(authenticatedPage.url());

    expect(url.searchParams.get('folder')).toBe('folder-1');
    expect(url.searchParams.get('categories')).toBe('VIDEO');
  });

  test('serves Recent, Starred, and Trash as their own destinations', async ({
    authenticatedPage,
  }) => {
    for (const route of [
      APP_ROUTES.LIBRARY.RECENT,
      APP_ROUTES.LIBRARY.STARRED,
      APP_ROUTES.LIBRARY.TRASH,
    ]) {
      await assertRouteRenders(authenticatedPage, brandRoute(route));

      const expected = new URL(brandRoute(route), authenticatedPage.url());
      const actual = new URL(authenticatedPage.url());
      expect(actual.pathname).toBe(expected.pathname);
      expect(actual.search).toBe(expected.search);
    }
  });

  test('keeps type routes working as seeded deep links', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      brandRoute(APP_ROUTES.LIBRARY.VIDEOS),
    );

    expect(
      new URL(authenticatedPage.url()).searchParams.getAll('categories'),
    ).toEqual(['VIDEO', 'VIDEO_EDIT']);
    await expect(
      authenticatedPage.getByRole('link', { name: 'Assets', exact: true }),
    ).toBeVisible();
  });
});
