import {
  type PageScope,
  PostStatus,
  TargetExecutionState,
} from '@genfeedai/contracts';
import {
  PUBLISHING_POSTS_PUBLICATION_STATES,
  type PublishingPostsPublicationState,
} from '@genfeedai/contracts/constants';
import type { IPost } from '@genfeedai/contracts/interfaces';

export type PostsPublicationState = PublishingPostsPublicationState;
export type PublishingPostsView =
  | PostsPublicationState
  | PostStatus.FAILED
  | PostStatus.PENDING
  | PostStatus.PROCESSING;

/**
 * `Post.source` provenance filter. Lowercase `extension` is the persisted/query
 * value shared with the API (`PostsQueryDto.source`); the UI label is Extension.
 */
export const POSTS_SOURCE_EXTENSION = 'extension';
export type PostsSourceFilter = typeof POSTS_SOURCE_EXTENSION;

export function parsePostsSource(
  value?: string | null,
): PostsSourceFilter | undefined {
  return value === POSTS_SOURCE_EXTENSION ? value : undefined;
}

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

/**
 * Whether any post in the list is live. A TikTok Inbox receipt is stored as
 * published but waits for the creator to publish it, so it is not live.
 */
export function hasLivePosts(
  posts: Array<Pick<IPost, 'isInboxDelivery' | 'targetExecutionState'>>,
): boolean {
  return posts.some(
    (post) =>
      post.targetExecutionState === TargetExecutionState.PUBLISHED &&
      !post.isInboxDelivery,
  );
}
