import type { LearningResolution } from '@api/collections/content-learning/services/learning-decision.service';
import { ContentLearningMode } from '@genfeedai/contracts';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  LearningGenerationApplicationV1,
  LearningGenerationReceipt,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { learningContribution } from '@genfeedai/harness';

const SUPPRESSED_REASONS = new Set([
  'paused',
  'account_changed',
  'scope_changed',
  'invalid_lineage',
  'invalid_source',
  'expired_policy',
  'decision_missing',
  'learning_incompatible',
  'brand_compatibility_unknown',
]);
const INACTIVE = { privatePolicyApplied: false, sharedReleaseApplied: false };

export function unavailableLearningReceiptV1(
  reason: string,
  revalidatedAt: Date,
): LearningGenerationReceipt {
  return {
    mode: 'unavailable',
    reason,
    configVersion: 'rl-reward-v1-experimental',
    synthetic: false,
    application: {
      status: 'unavailable',
      reasonCodes: [reason],
      ...INACTIVE,
      revalidatedAt: revalidatedAt.toISOString(),
    },
  };
}
type LearningApplicationStatus = Pick<
  LearningGenerationApplicationV1,
  'status' | 'reasonCodes' | 'appliedArmId'
>;

/**
 * The arm a non-empty contribution truly applies: a live pilot treatment whose
 * contribution is exactly that arm's fixed tactic, with full opportunity and
 * policy provenance and an approved-brand check that did not exclude the arm.
 */
function appliedArmId(
  resolution: LearningResolution,
): LearningGenerationApplicationV1['appliedArmId'] {
  const { receipt, contribution, exclusions } = resolution;
  const armId = receipt.armId;
  if (
    !armId ||
    armId === 'baseline-v1' ||
    receipt.mode !== ContentLearningMode.LIVE ||
    receipt.assignment !== 'pilot' ||
    !receipt.opportunityId ||
    !receipt.experimentId ||
    !receipt.policyVersionId ||
    !exclusions ||
    exclusions.some((exclusion) => exclusion.armId === armId)
  )
    return undefined;
  try {
    return JSON.stringify(contribution) ===
      JSON.stringify(learningContribution(armId))
      ? armId
      : undefined;
  } catch {
    return undefined;
  }
}
function application(
  resolution: LearningResolution,
): LearningApplicationStatus {
  const { receipt, contribution } = resolution;
  const reason = receipt.reason;
  if (Object.keys(contribution).length) {
    const armId = appliedArmId(resolution);
    return armId
      ? { status: 'applied', reasonCodes: [], appliedArmId: armId }
      : {
          status: 'suppressed',
          reasonCodes: ['learning_contribution_unrecognized'],
        };
  }
  if (receipt.mode === 'no_destination')
    return { status: 'unavailable', reasonCodes: ['no_destination'] };
  if (receipt.mode === 'unavailable')
    return {
      status: 'unavailable',
      reasonCodes: [reason ?? 'learning_unavailable'],
    };
  if (reason === 'disabled')
    return { status: 'unavailable', reasonCodes: ['disabled'] };
  if (reason === 'shadow') return { status: 'shadow', reasonCodes: ['shadow'] };
  if (reason && SUPPRESSED_REASONS.has(reason))
    return { status: 'suppressed', reasonCodes: [reason] };
  return { status: 'baseline', reasonCodes: reason ? [reason] : [] };
}

function exclusionReasonCodes(
  exclusions: LearningResolution['exclusions'],
): string[] {
  return [
    ...new Set(
      (exclusions ?? []).map(
        ({ armId, reasonCode }) =>
          `learning_arm_excluded:${armId}:${reasonCode}`,
      ),
    ),
  ].sort();
}

/**
 * Maps a resolved decision to the caller-visible application receipt. Only an
 * exact, fully attributed live pilot treatment is reported `applied`; any
 * other non-empty contribution is suppressed, and a receipt that fails its
 * contract degrades to unavailable.
 */
export function learningGenerationApplicationReceiptV1(
  resolution: LearningResolution,
  revalidatedAt: Date,
): LearningGenerationReceipt {
  const status = application(resolution);
  const isApplied = status.status === 'applied';
  const parsed = learningGenerationReceiptSchema.safeParse({
    ...resolution.receipt,
    application: {
      ...status,
      reasonCodes: [
        ...status.reasonCodes,
        ...exclusionReasonCodes(resolution.exclusions),
      ],
      privatePolicyApplied: isApplied,
      sharedReleaseApplied: false,
      revalidatedAt: revalidatedAt.toISOString(),
    },
  });
  return parsed.success
    ? parsed.data
    : unavailableLearningReceiptV1(
        'learning_receipt_integrity_failed',
        revalidatedAt,
      );
}
