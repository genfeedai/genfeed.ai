import { ArticleFilterUtil } from '@api/helpers/utils/article-filter/article-filter.util';
import { ArticleScope } from '@genfeedai/contracts';
import { traced } from '@libs/tracing/traced';
import { ConflictException } from '@nestjs/common';

/**
 * A publish that carries no content rests on the stored revision it just
 * validated as reader copy. Content saved between that read and the write would
 * otherwise be published unchecked, so such a write is tied to the revision.
 */
export function shouldGuardPublishedRevision(
  update: { content?: string | null },
  stored: { status?: string | null },
  destinationStatus: string | null | undefined,
): boolean {
  return (
    update.content === undefined &&
    !ArticleFilterUtil.isPublicArticleStatus(stored.status) &&
    ArticleFilterUtil.isPublicArticleStatus(destinationStatus)
  );
}

/**
 * Writes `data` only while the article is still at the `updatedAt` that was
 * validated. A save in between moves `updatedAt`, so the stale publish is
 * rejected and the owner publishes again from the current revision.
 */
export const patchValidatedRevision = traced(
  'patchValidatedRevision',
  async <R>(
    patchOneWhere: (
      where: { id: string; updatedAt: Date | undefined },
      data: Record<string, unknown>,
    ) => Promise<R | null>,
    id: string,
    validatedAt: Date | undefined,
    data: Record<string, unknown>,
  ): Promise<R> => {
    const written = await patchOneWhere({ id, updatedAt: validatedAt }, data);
    if (!written) {
      throw new ConflictException(
        'The article changed while it was being published. Review it and publish again.',
      );
    }
    return written;
  },
);

/**
 * Apply the publish-state transition to `updateData` when an article is moved
 * to PUBLIC: always set scope to PUBLIC and stamp publishedAt the first time
 * (preserving an existing or DTO-provided date).
 */
export const applyPublishStateTransition = traced(
  'applyPublishStateTransition',
  async (
    findOneSelect: (
      where: Record<string, unknown>,
      select: { publishedAt: true },
    ) => Promise<{ publishedAt?: Date | string | null } | null>,
    params: {
      id: string;
      userId: string;
      organizationId: string;
      updateData: Record<string, unknown>;
      publishedAtFromDto?: string;
    },
  ): Promise<void> => {
    params.updateData.scope = ArticleScope.PUBLIC;

    const currentArticle = await findOneSelect(
      {
        id: params.id,
        OR: [
          { userId: params.userId },
          { organizationId: params.organizationId },
        ],
      },
      { publishedAt: true },
    );

    if (currentArticle) {
      // Set publishedAt if empty/null (first time publishing or missing date).
      // If republishing and publishedAt already exists, keep it as is.
      if (!currentArticle.publishedAt) {
        params.updateData.publishedAt =
          params.publishedAtFromDto ?? new Date().toISOString();
      }
    } else if (!params.publishedAtFromDto) {
      // Article not found, but the patch call that follows reports it. Still
      // stamp publishedAt for safety unless the DTO provided one.
      params.updateData.publishedAt = new Date().toISOString();
    }
  },
);
