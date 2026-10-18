'use client';

import { PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createFilterHref } from '@helpers/navigation/filter-href.helper';
import type { ITagsLayoutProps } from '@props/admin/tags.props';
import AdminOrgBrandUrlFilter from '@ui/content/admin-filters/AdminOrgBrandUrlFilter';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Tag } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function TagsLayout({
  children,
  scope,
  filters,
  primaryAction,
  onRefresh,
  isRefreshing,
}: ITagsLayoutProps) {
  const search = useSearchParams()?.toString() ?? '';
  const filterHref = (filter: string) =>
    createFilterHref(
      APP_ROUTES.ADMIN.CONFIGURATION.TAGS,
      search,
      'filter',
      filter,
    );
  // Both customer and admin views navigate the same tag categories.
  const tabs =
    scope === PageScope.ORGANIZATION || scope === PageScope.SUPERADMIN
      ? [
          { href: filterHref('all'), label: 'All' },
          {
            href: filterHref('default'),
            label: 'Default',
          },
          {
            href: filterHref('organization'),
            label: 'Organization',
          },
          {
            href: filterHref('account'),
            label: 'Account',
          },
        ]
      : undefined;

  return (
    <AdminPageShell
      title="Tags"
      icon={Tag}
      tabs={
        tabs
          ? {
              activeTab: filterHref(
                ['all', 'default', 'organization', 'account'].find(
                  (value) =>
                    value === new URLSearchParams(search).get('filter'),
                ) ?? 'all',
              ),
              fullWidth: false,
              tabs,
            }
          : undefined
      }
      filters={filters}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      dropdowns={
        scope === PageScope.SUPERADMIN ? <AdminOrgBrandUrlFilter /> : undefined
      }
      primaryAction={primaryAction}
    >
      {children}
    </AdminPageShell>
  );
}
