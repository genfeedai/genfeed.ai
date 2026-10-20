import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import {
  documentId,
  strategyId,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import type { PostDocument } from '@api/collections/posts/post.schema';
import type { PostAccountTarget } from '@api/collections/posts/services/post-account-fanout.service';
import type {
  PostCreateInput,
  PostsService,
} from '@api/collections/posts/services/posts.service';
import { PostCategory, TargetExecutionState } from '@genfeedai/contracts';

export interface AutopilotTextScheduleInput {
  brandId: string;
  draft: PostDocument;
  draftId: string;
  groupId: string;
  organizationId: string;
  strategy: AgentStrategyDocument;
  targets: readonly PostAccountTarget[];
  userId: string;
}

/**
 * Schedules an autopilot text draft on every target account: the draft
 * becomes the first account's post, and the rest are siblings sharing its
 * groupId.
 */
export async function scheduleAutopilotTextTargets(
  postsService: Pick<PostsService, 'create' | 'patch'>,
  input: AutopilotTextScheduleInput,
): Promise<string[]> {
  const { draft } = input;
  const postIds: string[] = [];
  for (const target of input.targets) {
    const post =
      postIds.length > 0
        ? await postsService.create({
            agentStrategyId: strategyId(input.strategy),
            brandId: input.brandId,
            category: PostCategory.TEXT,
            contentRunId: draft.contentRunId ?? undefined,
            credentialId: target.credentialId,
            description: target.caption,
            groupId: input.groupId,
            organizationId: input.organizationId,
            platform: target.platform,
            promptUsed: draft.promptUsed ?? undefined,
            scheduledDate: new Date(),
            source: draft.source ?? undefined,
            targetAttachments: draft.targetAttachments,
            targetExecutionState: TargetExecutionState.SCHEDULED,
            targetSettings: draft.targetSettings,
            userId: input.userId,
          } as PostCreateInput)
        : await postsService.patch(input.draftId, {
            description: target.caption,
            credentialId: target.credentialId,
            groupId: input.groupId,
            platform: target.platform,
            scheduledDate: new Date(),
            targetExecutionState: TargetExecutionState.SCHEDULED,
            userId: input.userId,
          });
    postIds.push(documentId(post));
  }
  return postIds;
}
