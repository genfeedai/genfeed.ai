'use client';

import FilterMenu from '@/components/content/filter-menu/FilterMenu';
import type { AdminScopeFilterProps } from '@/props/ui/forms/admin-org-brand-filter.props';

/** Nothing of its own to clear: the scope facets clear themselves. */
function clearNothing(): void {}

/**
 * The Filters menu of an admin list whose only filter is the organization and
 * brand scope. Inside a `SearchField` pass `isAttached`; on a page without a
 * search field, pass it as the `filters` slot.
 */
export default function AdminScopeFilter({
  isAttached = false,
}: AdminScopeFilterProps) {
  return (
    <FilterMenu
      facets={[]}
      hasAdminScope
      isAttached={isAttached}
      onClear={clearNothing}
    />
  );
}
