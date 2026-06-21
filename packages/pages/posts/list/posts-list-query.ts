import { type PageScope, PostStatus } from '@genfeedai/enums';

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
  scope,
  status,
}: PostsListQueryKeyInput) {
  return [
    'posts-list',
    scope,
    brandId,
    organizationId,
    platformFilter,
    filterSearch,
    filterStatus,
    filterSort,
    currentPage,
    status,
    adminOrg,
    adminBrand,
  ] as const;
}
