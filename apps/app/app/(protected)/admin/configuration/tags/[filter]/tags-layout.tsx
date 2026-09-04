'use client';

import { PageScope } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { ContentProps } from '@props/layout/content.props';
import Container from '@ui/layout/container/Container';
import { Tag } from 'lucide-react';
import type { ReactNode } from 'react';

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
  // Both customer and admin views navigate the same tag categories.
  const tabs =
    scope === PageScope.ORGANIZATION || scope === PageScope.SUPERADMIN
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
      icon={Tag}
      headerTabs={
        tabs
          ? {
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
