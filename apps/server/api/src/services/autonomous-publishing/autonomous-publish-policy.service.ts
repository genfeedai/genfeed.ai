import { createHash } from 'node:crypto';
import { recordAgentReviewOutcome } from '@api/services/notifications/workflow-notifications/workflow-notification-outbox.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import {
  AgentAutonomyMode,
  AgentPublishDecision,
  fromPrismaCredentialPlatform,
  normalizeAgentAutonomyMode,
  ReviewDecision,
  toPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  type AgentPublishPolicyResult,
  evaluateAgentPublishPolicy,
} from '@genfeedai/contracts/api-types/contracts/agent-publish-policy.contract';
import { Prisma } from '@genfeedai/prisma';
import { Injectable } from '@nestjs/common';

export interface ResolveAutonomousPostPolicyInput {
  organizationId: string;
  postId: string;
  strategyId?: string;
}
export interface ResolveAutonomousTargetPolicyInput {
  organizationId: string;
  brandId: string;
  strategyId?: string;
  personaId?: string;
  platform: string;
  credentialId?: string | null;
  channelAllowsAutoPublish?: boolean;
}
export interface ResolvedAutonomousPostPolicy {
  autonomyMode: AgentAutonomyMode;
  result: AgentPublishPolicyResult;
  strategyId?: string;
  reviewTimeoutHours: number;
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
  constructor(private readonly prisma: PrismaService) {}

  async resolveForPost(
    input: ResolveAutonomousPostPolicyInput,
    transaction?: Prisma.TransactionClient,
  ): Promise<ResolvedAutonomousPostPolicy> {
    const db = transaction ?? this.prisma;
    const post = await db.post.findFirst({
      where: scopedWhere(input.organizationId, { id: input.postId }),
    });
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
    const baseMode = normalizeAgentAutonomyMode(config.autonomyMode);
    const autonomyMode =
      state.autoPublishEnabled === false
        ? AgentAutonomyMode.SUPERVISED
        : state.autoPublishEnabled === true && globalEnabled
          ? AgentAutonomyMode.AUTO_PUBLISH
          : baseMode;
    const matchingStrategy = Boolean(strategy || (!strategyId && persona));
    return {
      autonomyMode,
      reviewTimeoutHours: boundedInteger(policy.reviewTimeoutHours, 24, 168),
      strategyId: strategy?.id,
      result: evaluateAgentPublishPolicy({
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
            fromPrismaCredentialPlatform(credential.platform) ===
              input.platform,
        ),
      }),
    };
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
      await recordAgentReviewOutcome(transaction, {
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
