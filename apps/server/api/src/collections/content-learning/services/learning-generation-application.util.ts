import type { LearningResolution } from '@api/collections/content-learning/services/learning-decision.service';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type {
  LearningGenerationApplicationV1,
  LearningGenerationReceipt,
} from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';

const SUPPRESSED_REASONS = new Set([
  'paused',
  'account_changed',
  'scope_changed',
  'invalid_lineage',
  'invalid_source',
  'expired_policy',
  'decision_missing',
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
function application(
  resolution: LearningResolution,
): Pick<LearningGenerationApplicationV1, 'status' | 'reasonCodes'> {
  const { receipt, contribution } = resolution;
  const reason = receipt.reason;
  if (Object.keys(contribution).length)
    return {
      status: 'suppressed',
      reasonCodes: ['learning_contribution_unrecognized'],
    };
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

/**
 * Maps a resolved decision to the caller-visible application receipt. No
 * learned contribution is applied in this revision, so `applied` is never
 * produced and any non-empty contribution is reported as suppressed.
 */
export function learningGenerationApplicationReceiptV1(
  resolution: LearningResolution,
  revalidatedAt: Date,
): LearningGenerationReceipt {
  const parsed = learningGenerationReceiptSchema.safeParse({
    ...resolution.receipt,
    application: {
      ...application(resolution),
      ...INACTIVE,
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
