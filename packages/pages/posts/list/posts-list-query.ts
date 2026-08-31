import {
  PUBLISHING_POSTS_PUBLICATION_STATES,
  type PublishingPostsPublicationState,
} from '@genfeedai/constants';
import { type PageScope, PostStatus } from '@genfeedai/enums';

export type PostsPublicationState = PublishingPostsPublicationState;
export type PublishingPostsView =
  | PostsPublicationState
  | PostStatus.FAILED
  | PostStatus.PENDING
  | PostStatus.PROCESSING;

export function parsePostsPublicationState(
  value?: string | null,
): PostsPublicationState | undefined {
  return PUBLISHING_POSTS_PUBLICATION_STATES.includes(
    value as PostsPublicationState,
  )
    ? (value as PostsPublicationState)
    : undefined;
}

export function parsePostsStatus(
  value?: string | null,
): PostStatus | undefined {
  return Object.values(PostStatus).includes(value as PostStatus)
    ? (value as PostStatus)
    : undefined;
}

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
