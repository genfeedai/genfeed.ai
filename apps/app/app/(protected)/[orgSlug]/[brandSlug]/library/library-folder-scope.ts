import { PageScope } from '@genfeedai/contracts';
import { MAX_PAGE_SIZE } from '@genfeedai/contracts/constants';
import type { IQueryParams } from '@genfeedai/contracts/interfaces';

/**
 * The folder axis follows the page's owner, not the destination.
 *
 * It used to flip to organization scope on `/library/avatars`, back when a type
 * was a separate surface. Type is a filter chip now, so the same folder tree has
 * to stand still underneath it — a tree that reshuffles when you tick "Avatars"
 * is exactly the coupling this redesign removes. Organization-shared folders
 * still show up on a brand: the API's brand scope is `brandId: null OR brandId`.
 * The organization view (`/:org/~/library`, no brand) lists the organization's
 * folders instead.
 */
export function getLibraryFolderScope(brandId?: string | null): PageScope {
  return brandId ? PageScope.BRAND : PageScope.ORGANIZATION;
}

export function getLibraryFolderOwnerId(
  scope: PageScope,
  brandId?: string | null,
  organizationId?: string | null,
): string | null {
  return scope === PageScope.ORGANIZATION
    ? (organizationId ?? null)
    : (brandId ?? null);
}

export function createLibraryFolderQuery(
  scope: PageScope,
  brandId?: string | null,
  organizationId?: string | null,
): IQueryParams {
  return {
    brand: scope === PageScope.BRAND ? (brandId ?? undefined) : undefined,
    isActive: true,
    // The sidebar loads the brand's folders as one flat page and nests them by
    // `parentId` client-side; the count stays well inside the server's page cap.
    limit: MAX_PAGE_SIZE,
    organization:
      scope === PageScope.ORGANIZATION
        ? (organizationId ?? undefined)
        : undefined,
  };
}
