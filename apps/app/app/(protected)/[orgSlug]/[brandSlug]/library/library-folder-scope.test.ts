import { PageScope } from '@genfeedai/contracts';
import { APP_ROUTES, MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  createLibraryFolderQuery,
  getLibraryFolderOwnerId,
  getLibraryFolderScope,
} from './library-folder-scope';

describe('Library folder scope', () => {
  it.each([
    APP_ROUTES.LIBRARY.ASSETS,
    APP_ROUTES.LIBRARY.AVATARS,
    APP_ROUTES.LIBRARY.GIFS,
    APP_ROUTES.LIBRARY.IMAGES,
    APP_ROUTES.LIBRARY.MUSIC,
    APP_ROUTES.LIBRARY.RECENT,
    APP_ROUTES.LIBRARY.STARRED,
    APP_ROUTES.LIBRARY.VIDEOS,
    `${APP_ROUTES.LIBRARY.SHELF}/needs-review`,
  ])('keeps the folder tree brand-scoped on %s', (route) => {
    const scope = getLibraryFolderScope(route);

    expect(scope).toBe(PageScope.BRAND);
    expect(getLibraryFolderOwnerId(scope, 'brand-1', 'org-1')).toBe('brand-1');
    expect(createLibraryFolderQuery(scope, 'brand-1', 'org-1')).toEqual({
      brand: 'brand-1',
      isActive: true,
      limit: MAX_PAGE_SIZE,
      organization: undefined,
    });
  });

  it('still builds an organization query when asked for one directly', () => {
    expect(
      createLibraryFolderQuery(PageScope.ORGANIZATION, 'brand-1', 'org-1'),
    ).toEqual({
      brand: undefined,
      isActive: true,
      limit: MAX_PAGE_SIZE,
      organization: 'org-1',
    });
  });
});
