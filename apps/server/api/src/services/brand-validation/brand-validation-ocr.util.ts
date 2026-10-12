import { normalizeBrandLiteralText } from '@api/services/brand-validation/brand-validation-rules.util';
import type { BrandArtifactVisual } from '@api/services/brand-validation/brand-validation-visual.util';
import { BRAND_VISION_PENDING_REASON } from '@api/services/brand-validation/brand-vision-pending.util';
import type {
  BrandOcrOutcome,
  BrandVisualAnalysis,
} from '@api/services/brand-validation/brand-visual-analysis.types';
import { hashBrandedGenerationTextV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandOcrProofV1 } from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationCheckV1,
  BrandArtifactValidationInputV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';

type OcrCategory = 'mandatory_rule' | 'avoid_rule';

function isOcrCategory(category: string): category is OcrCategory {
  return category === 'mandatory_rule' || category === 'avoid_rule';
}
/** The rules the text pass left for a reader of pixels: literal, nonempty, not text. */
const isReadable = (check: BrandArtifactValidationCheckV1) =>
  isOcrCategory(check.category) &&
  check.result === 'unknown' &&
  check.reasonCode === 'text_coverage_incomplete';

function unknownCheck(
  check: BrandArtifactValidationCheckV1,
  reasonCode: string,
): BrandArtifactValidationCheckV1 {
  return { ...check, reasonCode, result: 'unknown' };
}

function literalOf(
  input: BrandArtifactValidationInputV1,
  check: BrandArtifactValidationCheckV1,
): string | null {
  const rules = input.snapshot.generationRules;
  const rule = (
    check.category === 'mandatory_rule' ? rules.mandatory : rules.avoid
  ).find((candidate) => candidate.id === check.ruleId);
  return rule ? normalizeBrandLiteralText(rule.text) : null;
}

/**
 * Decides the mandatory and avoid literals of an image or video from the text a
 * vision model reads out of the final pixels, with the same exact, case-sensitive
 * matching as text. A reader can miss text but not invent a literal, so only
 * presence is evidence:
 *
 * - mandatory literal read in a frame: `pass`; not read: `unknown`
 * - avoid literal read in a frame: `fail`; not read: `unknown` (absence is unproven)
 *
 * Nothing is called when no check is readable. A disabled, pending or unavailable
 * analysis, an undecodable artifact or one that is not a single final visual
 * leaves every readable check `unknown`.
 */
export async function proveBrandLiteralChecksFromOcr(
  input: BrandArtifactValidationInputV1,
  checks: readonly BrandArtifactValidationCheckV1[],
  visual: BrandArtifactVisual,
  analysis: BrandVisualAnalysis | undefined,
): Promise<BrandArtifactValidationCheckV1[]> {
  if (
    input.artifact.mediaKind === 'text' ||
    !analysis ||
    !checks.some((check) => isReadable(check))
  )
    return [...checks];
  const { selection } = visual;
  const settle = (reasonCode: string) =>
    checks.map((check) =>
      isReadable(check) ? unknownCheck(check, reasonCode) : check,
    );
  if (selection.kind === 'unknown') return settle(selection.reasonCode);
  const encoded = await visual.analysisFrames();
  if (!encoded) return settle('artifact_undecodable');
  const outcome: BrandOcrOutcome = await analysis.extractText({
    frames: encoded.frames,
    scope: {
      brandId: input.snapshot.brandId,
      organizationId: input.snapshot.organizationId,
    },
  });
  if (outcome.status === 'disabled') return settle('visual_analysis_disabled');
  if (outcome.status === 'pending') return settle(BRAND_VISION_PENDING_REASON);
  if (outcome.status === 'unavailable')
    return settle('visual_analysis_unavailable');
  if (outcome.texts.length !== encoded.frames.length)
    return settle('visual_analysis_unavailable');
  const frameTexts = outcome.texts.map(normalizeBrandLiteralText);
  const frameTextHashes = frameTexts.map((text) =>
    hashBrandedGenerationTextV1(text),
  );
  return checks.map((check) => {
    if (!isReadable(check)) return check;
    const literal = literalOf(input, check);
    if (literal === null) return unknownCheck(check, 'empty_literal_rule');
    const matchedFrames = frameTexts.flatMap((text, index) =>
      text.includes(literal) ? [index] : [],
    );
    const isFound = matchedFrames.length > 0;
    const isMandatory = check.category === 'mandatory_rule';
    if (!isFound)
      return unknownCheck(
        check,
        isMandatory ? 'ocr_literal_not_found' : 'ocr_absence_unproven',
      );
    const proof: BrandOcrProofV1 = {
      algorithm: 'ocr-literal-v1',
      artifactHash: input.artifact.contentHash,
      decoder: encoded.decoder,
      frameTextHashes,
      kind: 'ocr',
      matchedFrames,
      mediaKind: selection.part.mediaKind,
      partHash: selection.part.hash,
      partId: selection.part.id,
      partVersion: selection.part.version,
      provider: outcome.provider,
      sampledFrames: encoded.frames.length,
    };
    const { reasonCode: _unread, ...rest } = check;
    return {
      ...rest,
      evaluatorId: `${outcome.provider.id}:${outcome.provider.model}`,
      method: 'deterministic_render',
      proof,
      result: isMandatory ? 'pass' : 'fail',
      ...(isMandatory ? {} : { reasonCode: 'forbidden_literal_present' }),
    };
  });
}
