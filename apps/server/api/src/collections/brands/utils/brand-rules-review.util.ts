import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import { BadRequestException, ConflictException } from '@nestjs/common';

const SHA256_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;

/**
 * The digest an approval stores for a draft's generation rules, or null when
 * the draft has none. The reviewer must send the digest of the rules they read,
 * so rules that changed after the review cannot be approved unseen.
 */
export function reviewedRulesHash(
  content: IBrandKitDraft,
  reviewedGenerationRulesHash: string | undefined,
): string | null {
  if (
    reviewedGenerationRulesHash !== undefined &&
    (typeof reviewedGenerationRulesHash !== 'string' ||
      reviewedGenerationRulesHash.length !== 71 ||
      !SHA256_DIGEST_PATTERN.test(reviewedGenerationRulesHash))
  )
    throw new BadRequestException('Invalid generation rules review hash');
  if (content.generationRules === undefined) return null;
  let digest: string;
  try {
    digest = hashBrandGenerationRulesReviewV1(content.generationRules);
  } catch {
    throw new BadRequestException('Invalid Brand OS generation rules');
  }
  if (reviewedGenerationRulesHash === undefined)
    throw new BadRequestException(
      'A valid generation rules review hash is required',
    );
  if (reviewedGenerationRulesHash !== digest)
    throw new ConflictException(
      'These generation rules changed. Reload and review them before approving.',
    );
  return digest;
}
