import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { usePageScope } from '@hooks/navigation/use-page-scope/use-page-scope';

export type CollectionListScope = 'org' | 'brand';

export type CollectionScope = {
  /** Present only when a brand is selected in the URL. */
  brandId: string | undefined;
  isReady: boolean;
  organizationId: string;
  pageScope: CollectionListScope;
};

/**
 * Org is always selected. Brand is either empty (`/:org/~/…`) or selected
 * (`/:org/:brand/…`). List fetches must use this instead of `useBrand().brandId`
 * alone — requiring a brand blanks org-scoped pages.
 */
export function useCollectionScope(): CollectionScope {
  const pageScope = usePageScope();
  const { brandId, isReady, organizationId } = useBrand();

  if (pageScope === 'org') {
    return {
      brandId: undefined,
      isReady,
      organizationId,
      pageScope,
    };
  }

  return {
    brandId: brandId || undefined,
    isReady,
    organizationId,
    pageScope,
  };
}

export function toBrandListParams(scope: Pick<CollectionScope, 'brandId'>): {
  brandId?: string;
} {
  return scope.brandId ? { brandId: scope.brandId } : {};
}

/** True when a list fetch may run for the current org/brand URL. */
export function isCollectionFetchReady(scope: CollectionScope): boolean {
  if (!scope.isReady || !scope.organizationId) {
    return false;
  }
  if (scope.pageScope === 'brand' && !scope.brandId) {
    return false;
  }
  return true;
}

/** True when a brand-owned create/mutate (hire, new program, mood board) may run. */
export function isBrandResourceReady(scope: CollectionScope): boolean {
  return isCollectionFetchReady(scope) && Boolean(scope.brandId);
}
