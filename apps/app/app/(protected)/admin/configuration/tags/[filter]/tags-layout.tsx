'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { PageScope } from '@genfeedai/enums';
import type { ContentProps } from '@props/layout/content.props';
import Container from '@ui/layout/container/Container';
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
          { href: APP_ROUTES.ADMIN.CONFIGURATION.TAGS_ALL, label: 'All' },
          {
            href: `${APP_ROUTES.ADMIN.CONFIGURATION.TAGS}/default`,
            label: 'Default',
          },
          {
            href: `${APP_ROUTES.ADMIN.CONFIGURATION.TAGS}/organization`,
            label: 'Organization',
          },
          {
            href: `${APP_ROUTES.ADMIN.CONFIGURATION.TAGS}/account`,
            label: 'Account',
          },
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
