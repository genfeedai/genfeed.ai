import type { BreakoutGenerationAdmission } from '@api/collections/outliers/services/breakout-generation-admission.util';
import type { ReviewTurboRunItemFormat } from '@api/services/turbo-run/constants/review-turbo-run-item-format.constant';
import { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { ContentFormat } from '@genfeedai/contracts';
import { ConflictException, Injectable } from '@nestjs/common';

export const BREAKOUT_REVIEW_WORKFLOW_NAME = 'Breakout response';

/** The review-queue item format of a response output's own format. */
export function breakoutReviewItemFormat(
  format: string,
): ReviewTurboRunItemFormat {
  switch (format) {
    case 'image':
      return ContentFormat.IMAGE;
    case 'carousel':
      return ContentFormat.CAROUSEL;
    case 'video':
      return ContentFormat.VIDEO;
    case 'short':
      return ContentFormat.REEL;
    default:
      return 'post';
  }
}

/**
 * Puts a response draft that needs a human's brand review into the existing publishing inbox,
 * the way every other branded draft that needs review gets there (a manual review run linking
 * the already-created canonical draft). It creates no post, spends nothing and publishes
 * nothing: a member with publish rights approves and schedules the draft there, and the
 * publication gate still admits it at schedule time and at dispatch.
 */
@Injectable()
export class BreakoutReviewHandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly turboRuns: TurboRunService,
  ) {}

  /** Idempotent: a draft already linked to a review run is left where it is. */
  async queue(
    admission: Readonly<BreakoutGenerationAdmission>,
    input: Readonly<{ postId: string; generationKey: string }>,
  ): Promise<{ turboRunId: string } | null> {
    const { scope } = admission;
    await admission.reauthorize(this.prisma);
    const post = await this.prisma.post.findFirst({
      where: scopedWhere(scope.organizationId, {
        id: input.postId,
        brandId: scope.brandId,
        credentialId: admission.credentialId,
        platform: scope.platform,
        parentId: null,
        breakoutOutputId: admission.outputId,
      }),
      select: {
        description: true,
        label: true,
        reviewTurboRunId: true,
        promptUsed: true,
      },
    });
    await admission.reauthorize(this.prisma);
    if (!post) throw new ConflictException('breakout_review_draft_unavailable');
    if (post.reviewTurboRunId) return null;
    const run = await this.turboRuns.createManualReviewTurboRun(
      {
        agentStrategyId: scope.strategyId,
        brandId: scope.brandId,
        items: [
          {
            caption: post.description,
            format: breakoutReviewItemFormat(scope.format),
            label: post.label ?? 'Breakout response',
            platform: scope.platform,
            postId: input.postId,
            prompt: post.promptUsed ?? post.description,
            sourceActionId: input.generationKey,
            sourceWorkflowId: admission.responseId,
            sourceWorkflowName: BREAKOUT_REVIEW_WORKFLOW_NAME,
          },
        ],
      },
      admission.actorUserId,
      scope.organizationId,
    );
    await admission.reauthorize(this.prisma);
    return { turboRunId: run.id };
  }
}
