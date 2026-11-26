import type {
  SchedulerPostGroup,
  SchedulerPostTarget,
  SchedulerTx,
} from '@api/collections/post-groups/services/post-group.types';
import {
  ATTACHMENT_POST_LABEL_SUFFIXES,
  attachmentPostLabel,
  buildAttachmentPostData,
  MAX_ATTACHMENT_POSTS_PER_TARGET,
  planAttachmentPosts,
  readStoredAttachments,
} from '@api/collections/post-groups/services/post-group-attachment-posts.util';
import { scopedWhere } from '@api/index';
import { traced } from '@libs/tracing/traced';

type SyncReleaseAttachmentPostsParams = {
  /** Target states that may still change: a published target is left alone. */
  editableStates: ReadonlySet<string>;
  group: SchedulerPostGroup;
  organizationId: string;
  /** The release's targets as they stand after the update. */
  targets: readonly SchedulerPostTarget[];
  userId: string;
};

/**
 * Make each unpublished target's comment and thread posts match the release's
 * attachments.
 *
 * The publish worker sends child posts, not the attachment JSON, so a comment
 * added to a release after it was created would be stored and shown but never
 * published. This runs after a release edit and: creates the missing child
 * posts, rewrites the ones whose text or order changed, deletes the ones that
 * were removed, and carries the parent's state, schedule and visibility onto
 * each (a parent moved to SCHEDULED must not leave its comment in DRAFT, where
 * the worker never loads it). A target that already published is left alone.
 *
 * Child posts are matched to the plan by position in `order`, including rows
 * that can no longer change (those are skipped, never rewritten), and only rows
 * labelled as attachment posts are touched, so thread children written by
 * the composer or an agent are never rewritten here.
 */
export const syncReleaseAttachmentPosts = traced(
  'syncReleaseAttachmentPosts',
  async (
    tx: SchedulerTx,
    params: SyncReleaseAttachmentPostsParams,
  ): Promise<void> => {
    const releaseAttachments = readStoredAttachments(params.group.attachments);

    for (const target of params.targets) {
      if (!params.editableStates.has(target.targetExecutionState)) {
        continue;
      }

      const plan = planAttachmentPosts({
        platform: target.platform,
        releaseAttachments,
        targetAttachments: readStoredAttachments(target.targetAttachments),
      });

      const existing = await tx.post.findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        select: {
          description: true,
          id: true,
          label: true,
          order: true,
          scheduledDate: true,
          targetExecutionState: true,
          timezone: true,
          visibility: true,
        },
        take: MAX_ATTACHMENT_POSTS_PER_TARGET,
        where: scopedWhere(params.organizationId, {
          OR: ATTACHMENT_POST_LABEL_SUFFIXES.map((suffix) => ({
            label: { endsWith: suffix },
          })),
          parentId: target.id,
        }),
      });

      for (const [index, attachment] of plan.entries()) {
        const current = existing[index];
        // A row that is no longer editable (delivered, or failed past
        // retry) keeps its position and is never rewritten or replaced.
        if (
          current &&
          !params.editableStates.has(current.targetExecutionState)
        ) {
          continue;
        }
        if (!current) {
          await tx.post.create({
            data: buildAttachmentPostData({
              attachment,
              brandId: target.brandId,
              groupId: params.group.id,
              organizationId: params.organizationId,
              parent: target,
              releaseTitle: params.group.title,
              userId: params.userId,
            }),
          });
          continue;
        }

        const label = attachmentPostLabel(params.group.title, attachment.kind);
        const isCurrent =
          current.description === attachment.body &&
          current.label === label &&
          current.order === attachment.order &&
          current.targetExecutionState === target.targetExecutionState &&
          current.timezone === target.timezone &&
          current.visibility === target.visibility &&
          current.scheduledDate?.getTime() === target.scheduledDate?.getTime();
        if (isCurrent) {
          continue;
        }

        await tx.post.updateMany({
          data: {
            description: attachment.body,
            label,
            order: attachment.order,
            scheduledDate: target.scheduledDate,
            targetExecutionState: target.targetExecutionState,
            timezone: target.timezone,
            visibility: target.visibility,
          },
          where: scopedWhere(params.organizationId, { id: current.id }),
        });
      }

      const removedIds = existing
        .slice(plan.length)
        .filter((child) =>
          params.editableStates.has(child.targetExecutionState),
        )
        .map((child) => child.id);
      if (removedIds.length > 0) {
        await tx.post.updateMany({
          data: { isDeleted: true },
          where: scopedWhere(params.organizationId, { id: { in: removedIds } }),
        });
      }
    }
  },
);
