import { APP_ROUTES } from '@genfeedai/constants';
import { PageScope } from '@genfeedai/enums';
import type { IQueryParams } from '@genfeedai/interfaces';

export function getLibraryFolderScope(pathname: string): PageScope {
  return pathname === APP_ROUTES.LIBRARY.AVATARS
    ? PageScope.ORGANIZATION
    : PageScope.BRAND;
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
    organization:
      scope === PageScope.ORGANIZATION
        ? (organizationId ?? undefined)
        : undefined,
    pagination: false,
  };
}
