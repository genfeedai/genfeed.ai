'use client';

import { PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPathViewHref } from '@helpers/navigation/filter-href.helper';
import AdminPageShell from '@ui/layout/admin-page-shell/AdminPageShell';
import { Tag } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import AdminOrgBrandUrlFilter from '@/components/content/admin-filters/AdminOrgBrandUrlFilter';
import type { ITagsLayoutProps } from '@/features/admin/props/tags.props';

export default function TagsLayout({
  children,
  scope,
  filters,
  search: searchNode,
  primaryAction,
  onRefresh,
  isRefreshing,
}: ITagsLayoutProps) {
  const search = useSearchParams()?.toString() ?? '';
  const pathname = usePathname() ?? '';
  // The view is a path segment (`/tags/default`); the filters stay in the query.
  const filterHref = (filter: string) =>
    createPathViewHref(
      `${APP_ROUTES.ADMIN.CONFIGURATION.TAGS}/${filter}`,
      search,
      'filter',
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
      search={searchNode}
      tabs={
        tabs
          ? {
              activeTab: filterHref(
                ['all', 'default', 'organization', 'account'].find(
                  (value) =>
                    pathname ===
                    `${APP_ROUTES.ADMIN.CONFIGURATION.TAGS}/${value}`,
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
