import type { ContentScope, ITag } from '@genfeedai/contracts/interfaces';
import type { ContentProps } from '@props/layout/content.props';
import type { ReactNode } from 'react';

export interface ITagsLayoutProps {
  children: ReactNode;
  scope: ContentProps['scope'];
  rightActions?: ReactNode;
}

export interface TagCellProps {
  tag: ITag;
}

export interface TagsListModalsProps {
  scope: ContentScope;
  selectedTag: ITag | null;
  organizationId: string | undefined;
  onConfirm: () => void;
}

export interface ITagsPageProps {
  scope: ContentProps['scope'];
  filter: 'all' | 'default' | 'organization' | 'account';
}
