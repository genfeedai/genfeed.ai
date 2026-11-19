import { CredentialPlatform, TargetExecutionState } from '@genfeedai/contracts';
import type { IPost } from '@genfeedai/contracts/interfaces';

/**
 * A post is published once it has a publication date or its target reports
 * `published`. A post imported from a platform has a publication date and no
 * publishing target, so its execution state alone still reads `draft`.
 */
export function isPostPublished(
  post: Pick<IPost, 'publicationDate' | 'targetExecutionState'>,
): boolean {
  return (
    Boolean(post.publicationDate) ||
    post.targetExecutionState === TargetExecutionState.PUBLISHED
  );
}

/** TikTok's Inbox receipt finishes the target without a public post. */
export function isTikTokInboxDelivered(
  post: Pick<
    IPost,
    | 'platform'
    | 'targetExecutionState'
    | 'externalId'
    | 'publicationDate'
    | 'publishedAt'
    | 'url'
  >,
): boolean {
  return (
    post.platform === CredentialPlatform.TIKTOK &&
    post.targetExecutionState === TargetExecutionState.PUBLISHED &&
    Boolean(post.externalId) &&
    !post.publicationDate &&
    !post.publishedAt &&
    !post.url
  );
}
