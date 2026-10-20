import { randomUUID } from 'node:crypto';
import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import {
  documentId,
  draftContent,
  draftId as getDraftId,
  strategyBrandId,
  strategyId,
  strategyOrganizationId,
} from '@api/collections/agent-strategies/services/agent-strategy-autopilot.helpers';
import type { PostDocument } from '@api/collections/posts/post.schema';
import type { PostAccountFanoutService } from '@api/collections/posts/services/post-account-fanout.service';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import type { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { PostCategory, TargetExecutionState } from '@genfeedai/contracts';

export interface AutopilotThreadPublishDependencies {
  autonomousPublishPolicy: Pick<
    AutonomousPublishPolicyService,
    'resolveForTarget' | 'scheduleWithinPostCaps'
  >;
  postAccountFanoutService: Pick<
    PostAccountFanoutService,
    'resolveDefaultTarget'
  >;
  postsService: Pick<PostsService, 'patch'>;
}

export interface AutopilotThreadPublishInput {
  draftId: string;
  platform: string;
  qualityScore: number;
  /** The thread's posts in order, root first. */
  segments: readonly string[];
  strategy: AgentStrategyDocument;
  userId: string;
}

/**
 * A thread publishes from one account: its replies chain under the root,
 * so a per-account variation of the root alone would break it. The brand's
 * default account takes it, through the same publish policy as a single
 * post, judged on the whole thread and counted as one post.
 */
export async function publishAutopilotThread(
  deps: AutopilotThreadPublishDependencies,
  input: AutopilotThreadPublishInput,
): Promise<{ policyReason?: string; postIds: string[]; scheduled: boolean }> {
  const brandId = strategyBrandId(input.strategy) ?? '';
  const organizationId = strategyOrganizationId(input.strategy);
  const target = await deps.postAccountFanoutService.resolveDefaultTarget({
    brandId,
    caption: input.segments.join('\n\n'),
    organizationId,
    platform: input.platform,
  });
  if (!target) return { postIds: [], scheduled: false };
  const resolve = () =>
    deps.autonomousPublishPolicy.resolveForTarget({
      brandId,
      caption: target.caption,
      credentialId: target.credentialId,
      organizationId,
      platform: target.platform,
      postId: input.draftId,
      postCategory: PostCategory.TEXT,
      qualityScore: input.qualityScore,
      strategyId: strategyId(input.strategy),
    });
  // Scheduling the root schedules its replies on the same account. The
  // Policy's post caps are counted and the root scheduled under one lock.
  const { policy, scheduled: post } =
    await deps.autonomousPublishPolicy.scheduleWithinPostCaps(
      { brandId, organizationId },
      await resolve(),
      resolve,
      () =>
        deps.postsService.patch(input.draftId, {
          credentialId: target.credentialId,
          groupId: randomUUID(),
          platform: target.platform,
          scheduledDate: new Date(),
          targetExecutionState: TargetExecutionState.SCHEDULED,
          userId: input.userId,
        }),
    );
  if (!post)
    return {
      policyReason: policy.result.reason,
      postIds: [],
      scheduled: false,
    };
  return { postIds: [documentId(post)], scheduled: true };
}

/** A thread's posts in order: the draft is its root, then its replies. */
export async function readAutopilotThreadSegments(
  postsService: Pick<PostsService, 'getChildren'>,
  format: string,
  draft: PostDocument,
  organizationId: string,
): Promise<string[] | undefined> {
  if (format !== 'thread') return undefined;
  const replies = await postsService.getChildren(
    getDraftId(draft),
    organizationId,
  );
  return [
    draftContent(draft),
    ...replies.map((reply) => reply.description ?? ''),
  ];
}
