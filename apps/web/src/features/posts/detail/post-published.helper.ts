import { TargetExecutionState } from '@genfeedai/contracts';
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
