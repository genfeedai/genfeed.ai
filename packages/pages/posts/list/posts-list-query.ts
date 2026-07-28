import { type PageScope, PostStatus } from '@genfeedai/enums';

export type PostsPublicationState = 'posted' | 'not-posted';

export interface PostsListQueryKeyInput {
  adminBrand: string;
  adminOrg: string;
  brandId?: string | null;
  currentPage: number;
  filterSearch: string;
  filterSort: string;
  filterStatus: PostStatus | string;
  organizationId?: string | null;
  platformFilter?: string;
  publicationState?: PostsPublicationState;
  scope: PageScope;
  status?: PostStatus;
}

export const getDefaultPostsSort = (status?: PostStatus): string => {
  if (status === PostStatus.SCHEDULED) {
    return 'scheduledDate: 1';
  }
  if (status === PostStatus.PUBLIC) {
    return 'scheduledDate: -1';
  }
  return 'createdAt: -1';
};

export function buildPostsListQueryKey({
  adminBrand,
  adminOrg,
  brandId,
  currentPage,
  filterSearch,
  filterSort,
  filterStatus,
  organizationId,
  platformFilter,
  publicationState,
  scope,
  status,
}: PostsListQueryKeyInput) {
  return [
    'posts-list',
    scope,
    brandId,
    organizationId,
    platformFilter,
    publicationState,
    filterSearch,
    filterStatus,
    filterSort,
    currentPage,
    status,
    adminOrg,
    adminBrand,
  ] as const;
}
