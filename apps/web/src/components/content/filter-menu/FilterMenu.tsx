'use client';

import type { FilterMenuProps } from '@genfeedai/props/ui/forms/filter-menu.props';
import SharedFilterMenu from '@ui/navigation/filter-menu/FilterMenu';
import { useTranslations } from 'next-intl';
import { useAdminOrgBrandUrlFacets } from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';

/**
 * The Filters menu of a platform-wide admin list: the page's own facets, then
 * the organization and brand facets. "Clear filters" clears both.
 */
function AdminScopedFilterMenu({
  facets,
  onClear,
  ...props
}: Omit<FilterMenuProps, 'hasAdminScope'>) {
  const scope = useAdminOrgBrandUrlFacets();

  return (
    <ProductFilterMenu
      {...props}
      facets={[...facets, ...scope.facets]}
      onClear={() => {
        onClear();
        scope.clearAfterPageClear();
      }}
    />
  );
}

/** The shared menu with the product app's messages filled in. */
function ProductFilterMenu({
  allLabel,
  clearLabel,
  getActiveCountLabel,
  label,
  ...props
}: Omit<FilterMenuProps, 'hasAdminScope'>) {
  const translate = useTranslations('ui.filtersButton');

  return (
    <SharedFilterMenu
      {...props}
      allLabel={allLabel ?? translate('all')}
      clearLabel={clearLabel ?? translate('clear')}
      getActiveCountLabel={
        getActiveCountLabel ??
        ((count: number) => translate('activeCount', { count }))
      }
      label={label ?? translate('menu')}
    />
  );
}

/**
 * The Filters menu of a page. Every filter axis of the page is a facet of this
 * one menu. A page that lists platform-wide records sets `hasAdminScope`, and
 * the menu adds the organization and brand facets, so those two never become
 * dropdowns of their own in the header.
 */
export default function FilterMenu({
  hasAdminScope = false,
  ...props
}: FilterMenuProps) {
  return hasAdminScope ? (
    <AdminScopedFilterMenu {...props} />
  ) : (
    <ProductFilterMenu {...props} />
  );
}
