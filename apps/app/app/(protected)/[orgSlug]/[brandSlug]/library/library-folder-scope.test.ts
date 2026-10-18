import { PageScope } from '@genfeedai/contracts';
import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';
import {
  createLibraryFolderQuery,
  getLibraryFolderOwnerId,
  getLibraryFolderScope,
} from './library-folder-scope';

describe('Library folder scope', () => {
  it('keeps the folder tree brand-scoped on a brand', () => {
    const scope = getLibraryFolderScope('brand-1');

    expect(scope).toBe(PageScope.BRAND);
    expect(getLibraryFolderOwnerId(scope, 'brand-1', 'org-1')).toBe('brand-1');
    expect(createLibraryFolderQuery(scope, 'brand-1', 'org-1')).toEqual({
      brand: 'brand-1',
      isActive: true,
      limit: MAX_PAGE_SIZE,
      organization: undefined,
    });
  });

  it.each([undefined, null, ''])(
    'lists the organization folders when no brand is selected (%s)',
    (brandId) => {
      const scope = getLibraryFolderScope(brandId);

      expect(scope).toBe(PageScope.ORGANIZATION);
      expect(getLibraryFolderOwnerId(scope, brandId, 'org-1')).toBe('org-1');
    },
  );

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
