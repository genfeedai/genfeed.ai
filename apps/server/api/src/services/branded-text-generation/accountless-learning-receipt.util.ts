import type { LearningDecisionService } from '@api/collections/content-learning/services/learning-decision.service';
import { learningGenerationReceiptSchema } from '@genfeedai/contracts/api-types/contracts/content-learning-generation.contract';
import type { LearningGenerationReceipt } from '@genfeedai/contracts/interfaces/analytics/content-learning.interface';
import { InternalServerErrorException } from '@nestjs/common';

const RECEIPT_KEYS = ['mode', 'reason', 'configVersion', 'synthetic'];

/**
 * The private-learning receipt of a text generation that has no destination
 * account: there is nothing to learn from or serve, and the receipt says so.
 * Anything richer than the accountless fallback fails closed.
 */
export async function resolveAccountlessLearningReceipt(
  decisions: Pick<LearningDecisionService, 'resolveForGeneration'>,
  input: { brandId: string; organizationId: string; originalPrompt: string },
): Promise<LearningGenerationReceipt> {
  const resolution = await decisions.resolveForGeneration({
    organizationId: input.organizationId,
    brandId: input.brandId,
    format: 'text',
    originalPrompt: input.originalPrompt,
    harnessEnabled: false,
    compatible: false,
  });
  if (
    resolution.receipt.mode !== 'no_destination' ||
    resolution.receipt.reason !== 'no_destination' ||
    resolution.receipt.synthetic !== false ||
    Object.keys(resolution.contribution).length !== 0 ||
    Object.keys(resolution.receipt).some((key) => !RECEIPT_KEYS.includes(key))
  )
    throw new InternalServerErrorException(
      'Accountless learning receipt integrity failed',
    );
  const parsed = learningGenerationReceiptSchema.safeParse({
    ...resolution.receipt,
    application: {
      status: 'unavailable',
      reasonCodes: ['no_destination'],
      privatePolicyApplied: false,
      sharedReleaseApplied: false,
      revalidatedAt: new Date().toISOString(),
    },
  });
  if (!parsed.success)
    throw new InternalServerErrorException(
      'Accountless learning receipt integrity failed',
    );
  return parsed.data;
}
