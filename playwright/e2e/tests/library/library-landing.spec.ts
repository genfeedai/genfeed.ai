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

  test('opens the asset browser at the Library root', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      brandRoute(APP_ROUTES.LIBRARY.ASSETS),
    );

    await expect(authenticatedPage).not.toHaveURL(/library\/overview/);
    await expect(
      authenticatedPage.getByRole('link', { name: 'All assets' }),
    ).toBeVisible();
  });

  test('lists places, shelves, and folders in the sidebar', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      brandRoute(APP_ROUTES.LIBRARY.ASSETS),
    );

    for (const label of ['All assets', 'Recent', 'Starred']) {
      await expect(
        authenticatedPage.getByRole('link', { name: label }),
      ).toBeVisible();
    }

    // The library nav renders in both the desktop rail and the mobile drawer,
    // so the group label resolves twice. Scope to the rail the test drives.
    await expect(
      authenticatedPage
        .getByTestId('desktop-sidebar-rail')
        .getByText('Shelves'),
    ).toBeVisible();

    for (const label of ['Unsorted', 'Needs review', 'Approved']) {
      await expect(
        authenticatedPage.getByRole('link', { name: label }),
      ).toBeVisible();
    }

    await expect(
      authenticatedPage.getByRole('link', { name: 'Trash' }),
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

    await expect(authenticatedPage).toHaveURL(/library\/shelf\/needs-review/);
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
      await expect(authenticatedPage).toHaveURL(new RegExp(`${route}$`));
    }
  });

  test('keeps type routes working as seeded deep links', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      brandRoute(APP_ROUTES.LIBRARY.VIDEOS),
    );

    await expect(authenticatedPage).toHaveURL(/library\/videos/);
    await expect(
      authenticatedPage.getByRole('link', { name: 'All assets' }),
    ).toBeVisible();
  });
});
