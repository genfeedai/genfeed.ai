'use client';

import type { ContentProps } from '@props/layout/content.props';
import Container from '@ui/layout/container/Container';
import { PageScope } from '@ui-constants/misc.constant';
import type { ReactNode } from 'react';
import { HiOutlineTag } from 'react-icons/hi2';

export interface ITagsLayoutProps {
  children: ReactNode;
  scope: ContentProps['scope'];
  rightActions?: ReactNode;
}

export default function TagsLayout({
  children,
  scope,
  rightActions,
}: ITagsLayoutProps) {
  // Only show tabs for organization scope
  const tabs =
    scope === PageScope.ORGANIZATION
      ? [
          { href: `/tags/all`, label: 'All' },
          { href: `/tags/default`, label: 'Default' },
          { href: `/tags/organization`, label: 'Organization' },
          { href: `/tags/account`, label: 'Account' },
        ]
      : undefined;

  return (
    <Container
      label="Tags"
      description="Organize content with tags."
      icon={HiOutlineTag}
      tabs={tabs}
      right={rightActions}
    >
      {children}
    </Container>
  );
}
