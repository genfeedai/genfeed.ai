import { APP_ROUTES } from '@genfeedai/constants';
import { PageScope } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';
import {
  createLibraryFolderQuery,
  getLibraryFolderOwnerId,
  getLibraryFolderScope,
} from './library-folder-scope';

describe('Library folder scope', () => {
  it('uses organization folders for organization-scoped avatars', () => {
    const scope = getLibraryFolderScope(APP_ROUTES.LIBRARY.AVATARS);

    expect(scope).toBe(PageScope.ORGANIZATION);
    expect(getLibraryFolderOwnerId(scope, 'brand-1', 'org-1')).toBe('org-1');
    expect(createLibraryFolderQuery(scope, 'brand-1', 'org-1')).toEqual({
      brand: undefined,
      isActive: true,
      organization: 'org-1',
      pagination: false,
    });
  });

  it.each([
    APP_ROUTES.LIBRARY.GIFS,
    APP_ROUTES.LIBRARY.IMAGES,
    APP_ROUTES.LIBRARY.MUSIC,
    APP_ROUTES.LIBRARY.VIDEOS,
  ])('uses brand folders for %s', (route) => {
    const scope = getLibraryFolderScope(route);

    expect(scope).toBe(PageScope.BRAND);
    expect(getLibraryFolderOwnerId(scope, 'brand-1', 'org-1')).toBe('brand-1');
    expect(createLibraryFolderQuery(scope, 'brand-1', 'org-1')).toEqual({
      brand: 'brand-1',
      isActive: true,
      organization: undefined,
      pagination: false,
    });
  });
});
