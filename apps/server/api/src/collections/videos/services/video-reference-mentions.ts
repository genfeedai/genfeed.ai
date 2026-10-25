import type { GenerationBriefReference } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import type {
  StudioReferenceMentionInvariantInput,
  StudioVideoReferenceMentionBindingInput,
} from '@genfeedai/contracts/interfaces/studio/studio-reference-mention.interface';
import { listReferenceMentionTokens } from '@genfeedai/helpers/content/reference-mention.util';
import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';

/** The raw-token contract is checked before a compiler can deduplicate/slice.
 * Return only image roles: the assembler appends videoReferenceIds itself.
 * Ordinary requests without image tokens retain their existing frame behavior.
 */
export function resolveVideoReferenceMentionBindings(
  input: StudioVideoReferenceMentionBindingInput,
): GenerationBriefReference[] | undefined {
  const tokens = listReferenceMentionTokens(input.text);
  if (!tokens.length) return undefined;
  const arrays = [
    { prefix: '@Image', ids: input.imageReferenceIds ?? [] },
    { prefix: '@Video', ids: input.videoReferenceIds ?? [] },
    { prefix: '@Audio', ids: input.audioReferenceIds ?? [] },
  ];
  const allIds = arrays.flatMap(({ ids }) => [...ids]);
  if (new Set(allIds).size !== allIds.length)
    throw new BadRequestException({
      code: 'REFERENCE_MENTION_DUPLICATE',
      detail:
        'Reference tokens require distinct attached assets. Remove duplicate attachments.',
    });
  for (const { prefix, ids } of arrays) {
    const mentioned = tokens.filter((token) => token.startsWith(prefix));
    if (!mentioned.length) continue;
    const available = new Set(ids.map((_, index) => `${prefix}${index + 1}`));
    const unmatched = mentioned.filter((token) => !available.has(token));
    if (unmatched.length)
      throw new BadRequestException({
        code: 'REFERENCE_MENTION_UNMATCHED',
        detail: `No attached reference matches ${[...new Set(unmatched)].join(', ')}. Attach it or remove the token.`,
      });
  }
  if (
    tokens.some((token) => token.startsWith('@Video')) &&
    input.runReferences?.some(
      (reference) => reference.role === 'reference_video',
    )
  )
    throw new BadRequestException({
      code: 'REFERENCE_MENTION_BINDING_CONFLICT',
      detail:
        'Video tokens require one ordered video attachment list. Remove conflicting typed video references.',
    });
  if (!tokens.some((token) => token.startsWith('@Image'))) return undefined;
  if (input.model !== MODEL_KEYS.REPLICATE_MINIMAX_H3)
    throw new BadRequestException({
      code: 'REFERENCE_MENTION_MODEL_UNSUPPORTED',
      detail:
        'Positional image references in video prompts require MiniMax H3. Choose that model or remove the image tokens.',
    });
  if (input.endFrameId || input.hasEditMask)
    throw new BadRequestException({
      code: 'REFERENCE_MENTION_DEDICATED_INPUT',
      detail:
        'Positional image references cannot be combined with a dedicated end frame or edit mask. Remove the dedicated input or the image tokens.',
    });
  const images = input.imageReferenceIds ?? [];
  if (images.length > 9)
    throw new BadRequestException({
      code: 'REFERENCE_MENTION_LIMIT',
      detail:
        'MiniMax H3 accepts at most nine positional image references. Remove extra image attachments.',
    });
  if (
    input.runReferences &&
    (input.runReferences.length !== images.length ||
      input.runReferences.some(
        (reference, index) =>
          reference.assetId !== images[index] ||
          reference.role === 'first_frame' ||
          reference.role === 'last_frame' ||
          reference.role === 'reference_video',
      ))
  )
    throw new BadRequestException({
      code: 'REFERENCE_MENTION_BINDING_CONFLICT',
      detail:
        'Typed references disagree with the attached image slots. Use the same image order without dedicated frame roles.',
    });
  return images.map((assetId) => ({ assetId, role: 'subject' }));
}

/** Call on the final prompt after enhancement/compilation and before creating
 * an output or entering generation credit admission. Enhancement may rewrite
 * prose and reorder mentions, but cannot strip, invent or renumber tokens.
 */
export function assertReferenceMentionInvariant({
  originalText,
  preparedText,
}: StudioReferenceMentionInvariantInput): void {
  const original = listReferenceMentionTokens(originalText).sort();
  const prepared = listReferenceMentionTokens(preparedText).sort();
  if (
    original.length === prepared.length &&
    original.every((token, index) => token === prepared[index])
  )
    return;
  throw new UnprocessableEntityException({
    code: 'REFERENCE_MENTION_ENHANCEMENT_CHANGED',
    detail:
      'Prompt preparation changed the reference tokens. Restore the tokens or explicitly turn off enhancement, then try again.',
  });
}
