'use client';

import type { FilterMenuProps } from '@genfeedai/props/ui/forms/filter-menu.props';
import FilterMenu from '@ui/navigation/filter-menu/FilterMenu';
import { useAdminOrgBrandUrlFacets } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';

/**
 * The Filters menu of a platform-wide admin list: the page's own facets, then
 * the organization and brand facets. "Clear filters" clears both.
 */
function AdminScopedFilterMenu({ facets, onClear, ...props }: FilterMenuProps) {
  const scope = useAdminOrgBrandUrlFacets();

  return (
    <FilterMenu
      {...props}
      facets={[...facets, ...scope.facets]}
      onClear={() => {
        onClear();
        scope.clearAfterPageClear();
      }}
    />
  );
}

/**
 * The shared Filters menu, with the admin organization and brand facets (kept
 * in the URL as `organization` and `brand`) added after the page's own when
 * `hasAdminScope` is set. Set it on the one Filters menu of a platform-wide
 * admin list, so those two never become dropdowns of their own in the header.
 */
export default function ScopedFilterMenu({
  hasAdminScope = false,
  ...props
}: FilterMenuProps & { hasAdminScope?: boolean }) {
  return hasAdminScope ? (
    <AdminScopedFilterMenu {...props} />
  ) : (
    <FilterMenu {...props} />
  );
}
