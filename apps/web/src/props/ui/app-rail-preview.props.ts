import type { ThreadListStatus } from '@genfeedai/props/ui/lists/thread-list.props';
import type { ReactNode } from 'react';

/** One row of a rail preview: a project, a thread, a task, a workflow. */
export interface AppRailPreviewItem {
  href: string;
  id: string;
  isoDate?: string | null;
  status?: ThreadListStatus;
  statusLabel?: string;
  subtitle?: ReactNode;
  title: string;
}

export interface AppRailPreviewSectionProps {
  children: ReactNode;
  count?: string;
  title: string;
}

export interface AppRailPreviewStateProps {
  children: ReactNode;
  emptyLabel: string;
  isEmpty: boolean;
  isError: boolean;
  isLoading: boolean;
  /** Rows the loading skeleton shows. */
  skeletonRows?: number;
}

export interface AppRailPreviewItemsProps {
  items: readonly AppRailPreviewItem[];
}

export interface AppRailPreviewStatProps {
  label: string;
  value: string;
}

interface AppRailPreviewThumbnail {
  alt: string;
  href: string;
  id: string;
  src: string;
}

export interface AppRailPreviewThumbnailGridProps {
  items: readonly AppRailPreviewThumbnail[];
}

export interface AppRailPreviewLinkRowProps {
  href: string;
  leading?: ReactNode;
  subtitle?: ReactNode;
  title: string;
  trailing?: ReactNode;
}

export interface AppRailPreviewMediaProps {
  /** Ingredient categories to list; every category when omitted. */
  categories?: readonly string[];
  emptyLabel: string;
  /** Keeps each app's media list in its own query cache entry. */
  queryScope: 'library' | 'playground';
  title: string;
}

export interface AppRailPreviewProjectsProps {
  items: readonly AppRailPreviewItem[];
  isError: boolean;
  isLoading: boolean;
  translationKey: string;
}

export interface AppRailPreviewLoadingProps {
  rows?: number;
}
