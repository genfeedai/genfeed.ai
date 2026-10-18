import type { IPublishApprovalHold } from '@api/publish-approvals/publish-approval-hold';
import type {
  BrandPolicyDraftFacts,
  BrandPublishPolicyService,
} from '@api/services/brand-publish-policy/brand-publish-policy.service';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { AgentAutonomyMode, AgentPublishDecision } from '@genfeedai/contracts';
import { evaluateAgentPublishPolicy } from '@genfeedai/contracts/api-types/contracts/agent-publish-policy.contract';
import type { IBrandPolicyViolation } from '@genfeedai/contracts/interfaces';
import {
  BrandOsRevisionStatus,
  type Prisma,
  type PrismaClient,
} from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

const TEXT_LOOKUP_LIMIT = 20;

type HoldPrisma = Pick<
  PrismaClient,
  'brandedGenerationReceipt' | 'brandOsRevision' | 'post'
>;

type HoldPolicy = Pick<
  BrandPublishPolicyService,
  'buildEvaluation' | 'describePost' | 'recordViolations'
>;

export type BrandedPublishHoldReason =
  | 'needs_review'
  | 'provisional_brand'
  | 'policy_violation';

export type BrandedPublishHold =
  | {
      brandId: string;
      receiptId: string;
      reason: Exclude<BrandedPublishHoldReason, 'policy_violation'>;
    }
  | {
      brandId: string;
      reason: 'policy_violation';
      /** The brand Policy rules the post broke (#7339). */
      violations: IBrandPolicyViolation[];
    };

const HOLD_MESSAGES: Record<BrandedPublishHoldReason, string> = {
  needs_review:
    'This post is held: its generation receipt is not cleared (validation is unavailable or unconfirmed). A member must approve it in the app before it can publish.',
  policy_violation:
    'This post is held: it breaks the brand Policy. A member must approve it in the app before it can publish.',
  provisional_brand:
    'This post is held: it was generated from a provisional brand kit that nobody has approved. A member must approve it in the app, or the brand needs an approved kit, before it can publish.',
};

/** A cleared receipt, or a raw one a member chose to generate without the brand. */
function isCleared(receipt: { mode: string; state: string }): boolean {
  return receipt.state === 'ready' || receipt.mode === 'raw';
}

/** Raised when a receipt-bound post may not be published unattended. */
export class BrandedPublishHoldException extends ConflictException {
  public readonly receiptId?: string;
  public readonly reason: BrandedPublishHoldReason;
  public readonly violations: IBrandPolicyViolation[];

  constructor(hold: BrandedPublishHold) {
    const isPolicy = hold.reason === 'policy_violation';
    super({
      ...(isPolicy
        ? { code: 'brand_policy_held', violations: hold.violations }
        : {
            brandedGenerationReceiptId: hold.receiptId,
            code: 'branded_receipt_held',
          }),
      detail: HOLD_MESSAGES[hold.reason],
      holdReason: hold.reason,
      title: 'Post held for review',
    });
    this.receiptId = isPolicy ? undefined : hold.receiptId;
    this.reason = hold.reason;
    this.violations = isPolicy ? hold.violations : [];
  }
}

/**
 * The brand Policy, judged through the single publish gate for a publish a
 * workflow or MCP asked for. Those requests chose to publish, so autonomy,
 * brand and channel are theirs; the Policy is what binds them.
 */
export async function evaluatePolicyHold(
  policy: HoldPolicy,
  facts: BrandPolicyDraftFacts,
  transaction?: Prisma.TransactionClient,
): Promise<BrandedPublishHold | null> {
  const brandPolicy = await policy.buildEvaluation(
    facts,
    { isJudgeEnabled: true },
    transaction,
  );
  const result = evaluateAgentPublishPolicy({
    autonomyMode: AgentAutonomyMode.AUTO_PUBLISH,
    brandAllowsAutoPublish: true,
    brandPolicy,
    channelAllowsAutoPublish: true,
  });
  return result.decision === AgentPublishDecision.DENIED
    ? {
        brandId: facts.brandId,
        reason: 'policy_violation',
        violations: result.policyViolations ?? [],
      }
    : null;
}

/**
 * Keeps unattended publishing from sending out text its brand receipt did not
 * clear (#5786). The receipt, not the post, is the authority: a post bound to
 * an approved or provisional receipt that is not `ready` is held until a member
 * approves it in the app, or, for a provisional receipt, until the brand has an
 * approved kit. Posts with no receipt, and raw posts a member chose to
 * generate without the brand, are not held.
 *
 * A workflow or MCP publish is also held while it breaks the brand Policy
 * (#7339), and the broken rules are recorded on the post for its reviewer.
 */
export class BrandedPublishHoldService implements IPublishApprovalHold {
  constructor(
    private readonly prisma: HoldPrisma,
    private readonly policy: HoldPolicy,
  ) {}

  async findHold(
    organizationId: string,
    postId: string,
  ): Promise<BrandedPublishHold | null> {
    const post = await this.prisma.post.findFirst({
      select: { brandId: true },
      where: scopedWhere(organizationId, { id: postId }),
    });
    if (!post) return null;
    const receipts = await this.prisma.brandedGenerationReceipt.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, mode: true, state: true },
      take: 1,
      // Cleared and raw receipts never hold, so only the rest need the JSON
      // path comparison.
      where: scopedWhere(organizationId, {
        brandId: post.brandId,
        mode: { not: 'raw' },
        projection: { equals: postId, path: ['artifact', 'id'] },
        state: { not: 'ready' },
      }),
    });
    return this.holdFor(organizationId, post.brandId, receipts);
  }

  /**
   * The hold on text that is about to be copied into a new post (the workflow
   * publish node saves a fresh post from a caption). Identical text that any
   * receipt cleared is not held; text only uncleared receipts produced is.
   */
  async findHoldForText(
    organizationId: string,
    brandId: string,
    text: string,
  ): Promise<BrandedPublishHold | null> {
    const receipts = await this.prisma.brandedGenerationReceipt.findMany({
      orderBy: { updatedAt: 'desc' },
      select: { id: true, mode: true, state: true },
      take: TEXT_LOOKUP_LIMIT,
      where: scopedWhere(organizationId, {
        brandId,
        projection: {
          equals: hashBrandedGenerationTextV1(text),
          path: ['artifact', 'version'],
        },
      }),
    });
    return this.holdFor(organizationId, brandId, receipts);
  }

  private async holdFor(
    organizationId: string,
    brandId: string,
    receipts: readonly { id: string; mode: string; state: string }[],
  ): Promise<BrandedPublishHold | null> {
    if (receipts.length === 0 || receipts.some(isCleared)) return null;
    const receipt = receipts[0];
    if (receipt?.mode === 'provisional_brand') {
      const approved = await this.prisma.brandOsRevision.findFirst({
        select: { id: true },
        where: scopedWhere(organizationId, {
          brandId,
          status: BrandOsRevisionStatus.APPROVED,
        }),
      });
      return approved
        ? null
        : { brandId, reason: 'provisional_brand', receiptId: receipt.id };
    }
    return receipt?.mode === 'approved_brand'
      ? { brandId, reason: 'needs_review', receiptId: receipt.id }
      : null;
  }

  /** The brand Policy hold on a saved post, with its violations recorded on it. */
  async findPolicyHold(
    organizationId: string,
    postId: string,
    transaction?: Prisma.TransactionClient,
  ): Promise<BrandedPublishHold | null> {
    const facts = await this.policy.describePost(
      organizationId,
      postId,
      transaction,
    );
    if (!facts) return null;
    const hold = await evaluatePolicyHold(this.policy, facts, transaction);
    await this.policy.recordViolations(
      organizationId,
      postId,
      hold?.reason === 'policy_violation' ? hold.violations : [],
      transaction,
    );
    return hold;
  }

  /**
   * The hold on text a workflow is about to publish as new posts, one per
   * destination platform: any platform the Policy holds holds them all.
   */
  async findPolicyHoldForText(
    facts: Omit<BrandPolicyDraftFacts, 'platform' | 'postId'>,
    platforms: readonly string[],
  ): Promise<BrandedPublishHold | null> {
    const violations: IBrandPolicyViolation[] = [];
    for (const platform of platforms.length > 0 ? platforms : ['']) {
      const hold = await evaluatePolicyHold(this.policy, {
        ...facts,
        platform,
      });
      if (hold?.reason === 'policy_violation')
        for (const violation of hold.violations)
          if (
            !violations.some(
              (seen) =>
                seen.rule === violation.rule &&
                seen.detail === violation.detail,
            )
          )
            violations.push(violation);
    }
    return violations.length > 0
      ? { brandId: facts.brandId, reason: 'policy_violation', violations }
      : null;
  }

  async assertPostPublishable(input: {
    organizationId: string;
    postId: string;
    isHumanApproval: boolean;
    isPolicyBound: boolean;
    transaction?: Prisma.TransactionClient;
  }): Promise<void> {
    if (input.isHumanApproval) return;
    const hold =
      (await this.findHold(input.organizationId, input.postId)) ??
      (input.isPolicyBound
        ? await this.findPolicyHold(
            input.organizationId,
            input.postId,
            input.transaction,
          )
        : null);
    if (hold) throw new BrandedPublishHoldException(hold);
  }
}
