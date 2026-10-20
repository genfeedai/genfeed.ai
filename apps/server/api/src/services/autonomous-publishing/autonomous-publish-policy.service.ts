import { createHash } from 'node:crypto';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import {
  type BrandPostCapScope,
  BrandPublishPolicyService,
  resolveBrandPolicyDraftFormat,
} from '@api/services/brand-publish-policy/brand-publish-policy.service';
import {
  MediaAssessmentService,
  toPolicyMediaAssessment,
} from '@api/services/media-assessment/media-assessment.service';
import { buildAgentReviewActivity } from '@api/services/notifications/workflow-notifications/workflow-outcome-activity';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AgentAutonomyMode,
  AgentPublishDecision,
  fromPrismaCredentialPlatform,
  normalizeAgentAutonomyMode,
  parsePlatform,
  ReviewDecision,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  type AgentPublishMediaAssessment,
  type AgentPublishPolicyResult,
  evaluateAgentPublishPolicy,
} from '@genfeedai/contracts/api-types/contracts/agent-publish-policy.contract';
import type { BrandPublishRequiredCheck } from '@genfeedai/contracts/interfaces';
import { Prisma } from '@genfeedai/prisma';
import { Injectable, Optional } from '@nestjs/common';

export interface ResolveAutonomousPostPolicyInput {
  organizationId: string;
  postId: string;
  strategyId?: string;
  /** 0–100 quality score measured for the draft, for the Policy minimum. */
  qualityScore?: number | null;
  /** When the post would go out; its scheduled date, else now, when absent. */
  publishAt?: Date;
}
export interface ResolveAutonomousTargetPolicyInput {
  organizationId: string;
  brandId: string;
  strategyId?: string;
  personaId?: string;
  platform: string;
  credentialId?: string | null;
  channelAllowsAutoPublish?: boolean;
  /**
   * Media attached to the publish. When present, the media assessment
   * (#4881) can only tighten the decision to review-required.
   */
  assetIds?: readonly string[];
  /** The post caption, for caption-consistency warnings (#4882) and the brand Policy. */
  caption?: string;
  /** The draft being decided; the brand Policy violations are recorded on it. */
  postId?: string;
  /** The saved post's category, which with the media decides the format. */
  postCategory?: string | null;
  /** When the post would go out; now when absent. */
  publishAt?: Date;
  /** 0–100 quality score measured for the draft, for the Policy minimum. */
  qualityScore?: number | null;
  /** Receipt-settled checks the draft passed. */
  passedChecks?: readonly BrandPublishRequiredCheck[];
}
export interface ResolvedAutonomousPostPolicy {
  autonomyMode: AgentAutonomyMode;
  result: AgentPublishPolicyResult;
  strategyId?: string;
  reviewTimeoutHours: number;
}
export interface ScheduledWithinPostCaps<T> {
  policy: ResolvedAutonomousPostPolicy;
  /** The write's result; absent when the policy did not permit it. */
  scheduled?: T;
}
export interface RecordAutonomousReviewInput
  extends ResolveAutonomousPostPolicyInput {
  decision: ReviewDecision;
  generatedCaption?: string;
  previousDecision?: ReviewDecision;
  hasRewriteHistory: boolean;
  versionPinId?: string;
  userId: string;
}
export interface AutonomousReviewTransition {
  decisionId: string;
  userId: string;
  postId: string;
  organizationId: string;
  brandId: string;
  strategyId: string;
  platform: string;
  autoPublishEnabled: boolean;
  approvalStreak: number;
}
export function policyObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function boundedInteger(value: unknown, fallback: number, max: number): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= max
    ? value
    : fallback;
}
@Injectable()
export class AutonomousPublishPolicyService {
  /** Without the module's judge, a Policy that needs one holds its drafts. */
  private readonly brandPublishPolicy: BrandPublishPolicyService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly activityRecorder: ActivityRecorderService,
    @Optional()
    private readonly mediaAssessmentService?: MediaAssessmentService,
    @Optional()
    brandPublishPolicy?: BrandPublishPolicyService,
  ) {
    this.brandPublishPolicy =
      brandPublishPolicy ?? new BrandPublishPolicyService(prisma);
  }

  /** How long an autonomous draft waits in review, without deciding anything. */
  async resolveReviewTimeoutHours(
    organizationId: string,
    strategyId: string | null | undefined,
    transaction?: Prisma.TransactionClient,
  ): Promise<number> {
    const strategy = strategyId
      ? await (transaction ?? this.prisma).agentStrategy.findFirst({
          select: { policies: true },
          where: scopedWhere(organizationId, { id: strategyId }),
        })
      : null;
    return boundedInteger(
      policyObject(policyObject(strategy?.policies).publishPolicy)
        .reviewTimeoutHours,
      24,
      168,
    );
  }

  async resolveForPost(
    input: ResolveAutonomousPostPolicyInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<ResolvedAutonomousPostPolicy> {
    const db = transaction ?? this.prisma;
    const post = await db.post.findFirst({
      where: scopedWhere(input.organizationId, { id: input.postId }),
    });
    const attached = post
      ? await db.ingredient.findMany({
          select: { id: true },
          where: scopedWhere(input.organizationId, {
            postLinks: { some: { postId: input.postId } },
          }),
        })
      : [];
    return this.resolveForTarget(
      {
        organizationId: input.organizationId,
        brandId: post?.brandId ?? '',
        strategyId: input.strategyId ?? post?.agentStrategyId ?? undefined,
        personaId: post?.personaId ?? undefined,
        platform: post?.platform ?? '',
        credentialId: post?.credentialId ?? null,
        channelAllowsAutoPublish:
          Boolean(post) &&
          (!input.strategyId ||
            !post?.agentStrategyId ||
            input.strategyId === post.agentStrategyId),
        assetIds: attached.map((ingredient) => ingredient.id),
        caption: post?.description,
        passedChecks:
          post?.brandedReceiptState === 'ready'
            ? ['brand_validation', 'fact_check']
            : [],
        postCategory: post?.category,
        postId: post?.id,
        publishAt: input.publishAt ?? post?.scheduledDate ?? undefined,
        qualityScore: input.qualityScore,
      },
      transaction,
    );
  }

  async resolveForTarget(
    input: ResolveAutonomousTargetPolicyInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<ResolvedAutonomousPostPolicy> {
    const db = transaction ?? this.prisma;
    const strategyId = input.strategyId;
    const strategy =
      strategyId && input.brandId
        ? await db.agentStrategy.findFirst({
            where: scopedWhere(input.organizationId, {
              id: strategyId,
              brandId: input.brandId,
            }),
          })
        : null;
    const brand = input.brandId
      ? await db.brand.findFirst({
          where: scopedWhere(input.organizationId, { id: input.brandId }),
        })
      : null;
    let credential =
      input.credentialId && input.brandId
        ? await db.credential.findFirst({
            where: scopedWhere(input.organizationId, {
              id: input.credentialId,
              brandId: input.brandId,
              isConnected: true,
            }),
          })
        : null;
    const platform = toPrismaCredentialPlatform(input.platform);
    if (input.credentialId === undefined && input.brandId && platform) {
      const candidates = await db.credential.findMany({
        where: scopedWhere(input.organizationId, {
          brandId: input.brandId,
          platform,
          isConnected: true,
        }),
        take: 2,
      });
      credential = candidates.length === 1 ? candidates[0] : null;
    }
    const persona =
      !strategyId && input.personaId && input.brandId
        ? await db.persona.findFirst({
            where: scopedWhere(input.organizationId, {
              id: input.personaId,
              brandId: input.brandId,
            }),
          })
        : null;
    const config = policyObject(strategy?.config ?? persona?.config);
    const policy = policyObject(policyObject(strategy?.policies).publishPolicy);
    const state = policyObject(
      policyObject(policy.platformStates)[input.platform],
    );
    const brandConfig = policyObject(brand?.agentConfig);
    const globalEnabled = strategy
      ? policy.autoPublishEnabled === true &&
        config.isEnabled !== false &&
        strategy.isActive
      : Boolean(persona) &&
        config.isEnabled !== false &&
        config.autoPublishEnabled !== false;
    // A strategy without its own mode follows the organization default, the
    // same fallback agent execution uses.
    const baseMode = normalizeAgentAutonomyMode(
      config.autonomyMode ??
        (strategy
          ? await this.readOrganizationAutonomyDefault(input.organizationId, db)
          : undefined),
    );
    const autonomyMode =
      state.autoPublishEnabled === false
        ? AgentAutonomyMode.SUPERVISED
        : state.autoPublishEnabled === true && globalEnabled
          ? AgentAutonomyMode.AUTO_PUBLISH
          : baseMode;
    const matchingStrategy = Boolean(strategy || (!strategyId && persona));
    const mediaAssessment = await this.assessMedia(input);
    const decided = {
      autonomyMode,
      brandAllowsAutoPublish:
        matchingStrategy &&
        globalEnabled &&
        brandConfig.enabled !== false &&
        policyObject(brandConfig.autoPublish).enabled === true &&
        policyObject(brandConfig.autoPublish).isApprovalRequired !== true,
      channelAllowsAutoPublish: Boolean(
        input.channelAllowsAutoPublish !== false &&
          credential &&
          fromPrismaCredentialPlatform(credential.platform) === input.platform,
      ),
      mediaAssessment,
    };
    // The brand Policy (#7339) binds every unattended publish. Its judge only
    // runs for a draft that nothing else already sends to review.
    const brandPolicy = await this.brandPublishPolicy.buildEvaluation(
      {
        brandId: input.brandId,
        format: resolveBrandPolicyDraftFormat(
          input.postCategory,
          await this.brandPublishPolicy.readIngredientCategories(
            input.organizationId,
            input.assetIds ?? [],
            db,
          ),
        ),
        organizationId: input.organizationId,
        passedChecks: input.passedChecks,
        platform: input.platform,
        postId: input.postId,
        publishAt: input.publishAt ?? new Date(),
        qualityScore: input.qualityScore,
        text: input.caption ?? '',
      },
      {
        isJudgeEnabled:
          evaluateAgentPublishPolicy(decided).decision ===
          AgentPublishDecision.PERMITTED,
      },
      db,
    );
    const result = evaluateAgentPublishPolicy({ ...decided, brandPolicy });
    if (input.postId)
      await this.brandPublishPolicy.recordViolations(
        input.organizationId,
        input.postId,
        result.policyViolations ?? [],
        db,
      );
    return {
      autonomyMode,
      reviewTimeoutHours: boundedInteger(policy.reviewTimeoutHours, 24, 168),
      strategyId: strategy?.id,
      result,
    };
  }

  /**
   * Writes an unattended SCHEDULED post under the brand's post-cap lock
   * (#7458). `preview` is the caller's evaluation, made before the lock so the
   * judge never runs under it. A brand with caps evaluates again once the lock
   * is held, so the counts include every publish that held it before, and the
   * lock is released only after `schedule` has committed its post.
   */
  async scheduleWithinPostCaps<T>(
    scope: BrandPostCapScope,
    preview: ResolvedAutonomousPostPolicy,
    evaluate: () => Promise<ResolvedAutonomousPostPolicy>,
    schedule: () => Promise<T>,
  ): Promise<ScheduledWithinPostCaps<T>> {
    if (preview.result.decision !== AgentPublishDecision.PERMITTED)
      return { policy: preview };
    return this.brandPublishPolicy.withPostCapLock(scope, async (isLocked) => {
      const policy = isLocked ? await evaluate() : preview;
      if (policy.result.decision !== AgentPublishDecision.PERMITTED)
        return { policy };
      return { policy, scheduled: await schedule() };
    });
  }

  /**
   * Persisted media gate results for the attached assets (#4881). Absent
   * service or media leaves the decision exactly as autonomy × brand ×
   * channel made it.
   */
  private assessMedia(input: ResolveAutonomousTargetPolicyInput) {
    return this.assessMediaForPolicy({
      assetIds: input.assetIds ?? [],
      caption: input.caption,
      organizationId: input.organizationId,
      platforms: [input.platform],
    });
  }

  /**
   * The media assessment in the form the publish policy consumes, for paths
   * that evaluate the policy without a strategy (the agent's confirmed
   * fallback). Undefined when no assessment service is wired or no media is
   * attached, which leaves the decision exactly as it was.
   */
  async assessMediaForPolicy(input: {
    assetIds: readonly string[];
    caption?: string;
    organizationId: string;
    platforms: readonly string[];
  }): Promise<AgentPublishMediaAssessment | undefined> {
    if (!this.mediaAssessmentService || input.assetIds.length === 0) {
      return undefined;
    }
    const assessment = await this.mediaAssessmentService.assessPublishMedia({
      assetIds: input.assetIds,
      caption: input.caption,
      organizationId: input.organizationId,
      platforms: input.platforms.flatMap((platform) => {
        const parsed = parsePlatform(platform);
        return parsed ? [parsed] : [];
      }),
    });
    return toPolicyMediaAssessment(assessment);
  }

  private async readOrganizationAutonomyDefault(
    organizationId: string,
    db: Prisma.TransactionClient | PrismaService,
  ): Promise<unknown> {
    const settings = await db.organizationSetting.findFirst({
      select: { agentPolicy: true },
      // One settings row per organization; the model has no soft delete.
      where: { organizationId },
    });
    return policyObject(settings?.agentPolicy).autonomyDefault;
  }

  /** Assessment reasons for a post's attached media, for the review inbox. */
  async assessPostMediaReasons(
    organizationId: string,
    postId: string,
  ): Promise<string[]> {
    if (!this.mediaAssessmentService) {
      return [];
    }
    const post = await this.prisma.post.findFirst({
      select: { description: true },
      where: scopedWhere(organizationId, { id: postId }),
    });
    if (!post) {
      return [];
    }
    const attached = await this.prisma.ingredient.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        postLinks: { some: { postId } },
      }),
    });
    const assessment = await this.assessMediaForPolicy({
      assetIds: attached.map((ingredient) => ingredient.id),
      caption: post.description,
      organizationId,
      platforms: [],
    });
    return assessment?.reasons ?? [];
  }

  async recordReviewDecision(
    input: RecordAutonomousReviewInput,
    transaction: Prisma.TransactionClient,
  ): Promise<AutonomousReviewTransition | null> {
    const post = await transaction.post.findFirst({
      where: scopedWhere(input.organizationId, { id: input.postId }),
    });
    if (
      input.decision === ReviewDecision.APPROVED &&
      post?.reviewDecision === 'APPROVED'
    )
      return null;
    if (!post?.agentStrategyId || !post.brandId || !post.platform) return null;
    const strategyId = post.agentStrategyId;
    await transaction.$queryRaw(
      Prisma.sql`SELECT "id" FROM "agent_strategies" WHERE "id" = ${strategyId} AND "organizationId" = ${input.organizationId} AND "isDeleted" = false FOR UPDATE`,
    );
    const strategy = await transaction.agentStrategy.findFirst({
      where: scopedWhere(input.organizationId, {
        id: strategyId,
        brandId: post.brandId,
      }),
    });
    if (!strategy) return null;
    const policies = policyObject(strategy.policies);
    const policy = policyObject(policies.publishPolicy);
    const states = policyObject(policy.platformStates);
    const previous = policyObject(states[post.platform]);
    const decisionKey = createHash('sha256')
      .update(
        JSON.stringify([
          post.id,
          input.versionPinId ?? post.updatedAt.toISOString(),
          input.decision,
        ]),
      )
      .digest('hex');
    if (
      previous.lastDecisionKey === decisionKey ||
      (input.decision === ReviewDecision.APPROVED &&
        input.previousDecision === ReviewDecision.APPROVED)
    )
      return null;
    const pristine =
      input.decision === ReviewDecision.APPROVED &&
      (!input.previousDecision ||
        input.previousDecision === ReviewDecision.UNSET) &&
      !input.hasRewriteHistory &&
      input.generatedCaption === post.description;
    const approvalStreak = pristine
      ? (typeof previous.approvalStreak === 'number'
          ? previous.approvalStreak
          : 0) + 1
      : 0;
    const threshold = boundedInteger(policy.autoPublishAfterApprovals, 5, 100);
    const brand = await transaction.brand.findFirst({
      where: scopedWhere(input.organizationId, { id: post.brandId }),
    });
    const brandConfig = policyObject(brand?.agentConfig);
    const autoPublishEnabled =
      pristine &&
      approvalStreak >= threshold &&
      policy.autoPublishEnabled === true &&
      policyObject(strategy.config).isEnabled !== false &&
      strategy.isActive &&
      brandConfig.enabled !== false &&
      policyObject(brandConfig.autoPublish).enabled === true &&
      policyObject(brandConfig.autoPublish).isApprovalRequired !== true;
    const next = {
      approvalStreak,
      autoPublishEnabled,
      lastDecisionKey: decisionKey,
    };
    await transaction.agentStrategy.updateMany({
      where: scopedWhere(input.organizationId, { id: strategyId }),
      data: {
        policies: {
          ...policies,
          publishPolicy: {
            ...policy,
            platformStates: { ...states, [post.platform]: next },
          },
        } as Prisma.InputJsonValue,
      },
    });
    const reverted =
      !pristine &&
      (previous.autoPublishEnabled === true ||
        normalizeAgentAutonomyMode(
          policyObject(strategy.config).autonomyMode,
        ) === AgentAutonomyMode.AUTO_PUBLISH);
    if (
      autoPublishEnabled !== (previous.autoPublishEnabled === true) ||
      reverted
    ) {
      await transaction.agentPublishAudit.create({
        data: {
          organizationId: input.organizationId,
          userId: input.userId,
          brandId: post.brandId,
          agentStrategyId: strategyId,
          channel: post.platform,
          autonomyMode: autoPublishEnabled
            ? AgentAutonomyMode.AUTO_PUBLISH
            : AgentAutonomyMode.SUPERVISED,
          decision: autoPublishEnabled
            ? AgentPublishDecision.PERMITTED
            : AgentPublishDecision.DENIED,
          policyName: 'autonomy-brand-channel',
          reason: autoPublishEnabled
            ? `Platform graduated after ${approvalStreak} pristine approvals.`
            : 'Platform reverted to supervised after a rejected or edited draft.',
        },
      });
      const review = await buildAgentReviewActivity(transaction, {
        decisionId: decisionKey,
        userId: input.userId,
        postId: post.id,
        organizationId: input.organizationId,
        brandId: post.brandId,
        strategyId,
        platform: post.platform,
        autoPublishEnabled,
        approvalStreak,
      });
      if (review) {
        // Committed with the caller's review transaction. The in-app item is
        // visible on commit; the delivery recovery sweep sends the email.
        await this.activityRecorder.recordInTransaction(transaction, review);
      }
      return {
        decisionId: decisionKey,
        userId: input.userId,
        postId: post.id,
        organizationId: input.organizationId,
        brandId: post.brandId,
        strategyId,
        platform: post.platform,
        autoPublishEnabled,
        approvalStreak,
      };
    }
    return null;
  }
}
