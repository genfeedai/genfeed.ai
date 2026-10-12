import { readOrganizationAutomationSettings } from '@api/collections/organization-settings/utils/organization-automation-settings.util';
import { isBreakoutAutoPublishAllowed } from '@api/collections/outliers/services/breakout-organization-gate.util';
import { readBreakoutOutputRecovery } from '@api/collections/outliers/services/breakout-output-recovery.util';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AutonomousPublishPolicyService } from '@api/services/autonomous-publishing/autonomous-publish-policy.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AgentPublishDecision,
  type Platform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';

export type BreakoutAutoPublishRequest = Readonly<{
  scope: Readonly<{
    organizationId: string;
    brandId: string;
    credentialId: string;
    platform: Platform;
  }>;
  responseId: string;
  outputId: string;
  strategyId: string;
  reauthorize: (tx: Prisma.TransactionClient) => Promise<void>;
}>;

export type BreakoutAutoPublishResult =
  | { status: 'scheduled'; postId: string }
  | { status: 'review_only'; reason: string };

function reviewOnly(reason: string): BreakoutAutoPublishResult {
  return { status: 'review_only', reason };
}

/**
 * Schedules a response output that passed every check, only for an organization that turned
 * breakout auto-publish on (#6526). Everything else stays a draft for a member to review.
 *
 * Passing every check means: the recovery read finds the draft untouched and waiting only for
 * publication admission (so the approved-brand receipt is `ready` and `passed`, factual
 * coverage included, and the quality gate approved it), no person has reviewed it, and the
 * strategy's own publish policy permits the account to publish without approval. The schedule
 * itself goes through the shared strategy scheduling write, whose publication fence admits it
 * again (pinned actor, live evidence, current growth, quota) in the same transaction.
 *
 * Auto-publication is best effort. The response is already paid for and its draft is valid, so
 * any hold, policy refusal or failure leaves the draft for review instead of failing the run.
 */
@Injectable()
export class BreakoutAutoPublishService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posts: PostsService,
    private readonly policy: AutonomousPublishPolicyService,
    private readonly logger: LoggerService,
  ) {}

  async schedule(
    request: BreakoutAutoPublishRequest,
  ): Promise<BreakoutAutoPublishResult> {
    const { scope } = request;
    await request.reauthorize(this.prisma);
    const settings = await readOrganizationAutomationSettings(
      this.prisma,
      scope.organizationId,
    );
    if (!isBreakoutAutoPublishAllowed(settings))
      return reviewOnly('org_auto_publish_disabled');
    const recovery = await readBreakoutOutputRecovery(this.prisma, {
      ...scope,
      outputId: request.outputId,
      responseId: request.responseId,
    });
    await request.reauthorize(this.prisma);
    if (
      recovery.status !== 'available' ||
      recovery.state !== 'draft' ||
      recovery.reason !== 'publication_admission_required' ||
      recovery.action !== 'requires_admission' ||
      !recovery.postId
    )
      return reviewOnly('output_not_ready');
    const post = await this.prisma.post.findFirst({
      select: { id: true, reviewDecision: true },
      where: scopedWhere(scope.organizationId, {
        agentStrategyId: request.strategyId,
        brandId: scope.brandId,
        breakoutOutputId: request.outputId,
        credentialId: scope.credentialId,
        id: recovery.postId,
        parentId: null,
        platform: scope.platform,
        targetExecutionState: TargetExecutionState.DRAFT,
      }),
    });
    await request.reauthorize(this.prisma);
    // A person who already decided on this draft schedules it themselves.
    if (!post || post.reviewDecision !== null)
      return reviewOnly('output_reviewed');
    const resolved = await this.policy.resolveForPost({
      organizationId: scope.organizationId,
      postId: post.id,
      strategyId: request.strategyId,
    });
    await request.reauthorize(this.prisma);
    if (resolved.result.decision !== AgentPublishDecision.PERMITTED)
      return reviewOnly(`publish_policy_${resolved.result.reason}`);
    try {
      await this.posts.patch(post.id, {
        scheduledDate: new Date(),
        targetExecutionState: TargetExecutionState.SCHEDULED,
      });
    } catch (error: unknown) {
      this.logger.warn('Breakout response was not auto-published', {
        error: getErrorMessage(error),
        organizationId: scope.organizationId,
        outputId: request.outputId,
      });
      return reviewOnly('publication_held');
    }
    return { postId: post.id, status: 'scheduled' };
  }
}
