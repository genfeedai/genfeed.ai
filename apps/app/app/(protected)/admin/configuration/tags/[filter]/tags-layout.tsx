'use client';

import { PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createFilterHref } from '@helpers/navigation/filter-href.helper';
import type { ITagsLayoutProps } from '@props/admin/tags.props';
import Container from '@ui/layout/container/Container';
import { Tag } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

export default function TagsLayout({
  children,
  scope,
  rightActions,
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
    <Container
      label="Tags"
      description="Organize content with tags."
      icon={Tag}
      headerTabs={
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
      right={rightActions}
    >
      {children}
    </Container>
  );
}
