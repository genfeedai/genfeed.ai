import { z } from 'zod';
import {
  brandTextRuleV1Schema,
  issue,
  keyed,
  refs,
} from './brand-generation-primitives.contract';
import { learningContractIdSchema as id } from './content-learning-generation.contract';

const videoPlacement = z.enum([
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
  'center',
]);
/**
 * How the brand moves on screen (#10187). Optional on the rules: a brand with
 * no video identity has no `video` key, and every reader treats that as a
 * no-op. Rule lists reuse the text-rule shape, so ids and evidence follow the
 * same global checks as `mandatory` and `avoid`.
 */
export const brandVideoRulesV1Schema = z.strictObject({
  motionStyle: z
    .strictObject({
      style: z.enum(['static', 'subtle', 'kinetic', 'cinematic', 'handheld']),
      notes: z.string().max(2000).optional(),
      evidenceIds: refs,
    })
    .optional(),
  pacing: z
    .strictObject({
      tempo: z.enum(['slow', 'medium', 'fast']),
      averageShotSeconds: z.number().min(0.5).max(30).optional(),
      evidenceIds: refs,
    })
    .optional(),
  shotRules: keyed(brandTextRuleV1Schema, 32),
  captions: z
    .strictObject({
      style: z.enum(['none', 'minimal', 'bold_word', 'karaoke', 'boxed']),
      position: z.enum(['top', 'middle', 'bottom']),
      maxWordsPerLine: z.number().int().min(1).max(12).optional(),
      typographyRuleId: id.optional(),
      evidenceIds: refs,
    })
    .optional(),
  thumbnailRules: keyed(brandTextRuleV1Schema, 16),
  logoPlacement: z
    .strictObject({
      position: videoPlacement,
      sizeRatio: z.number().min(0.02).max(0.5),
      insetRatio: z.number().min(0).max(0.25),
      appliesTo: z.enum(['intro', 'outro', 'throughout']),
      assetReferenceId: id.optional(),
      evidenceIds: refs,
    })
    .optional(),
});
export type BrandVideoRulesV1 = z.infer<typeof brandVideoRulesV1Schema>;

interface VideoRefsRules {
  assets: ReadonlyArray<{ id: string; role: string }>;
  typography: ReadonlyArray<{ id: string }>;
  video?: BrandVideoRulesV1;
}

/** The keyed rule rows inside the video section, for global id checks. */
export function videoRuleRows(video: BrandVideoRulesV1 | undefined) {
  return [...(video?.shotRules ?? []), ...(video?.thumbnailRules ?? [])];
}

/** Every video row that cites evidence ids. */
export function videoEvidenceRows(video: BrandVideoRulesV1 | undefined) {
  return [
    ...videoRuleRows(video),
    ...[
      video?.motionStyle,
      video?.pacing,
      video?.captions,
      video?.logoPlacement,
    ].filter((row) => row !== undefined),
  ];
}

/** Cross-references from the video section into the typography and assets. */
export function checkVideoReferences(
  rules: VideoRefsRules,
  ctx: z.RefinementCtx,
) {
  const captionFont = rules.video?.captions?.typographyRuleId;
  if (captionFont && !rules.typography.some((t) => t.id === captionFont))
    issue(ctx, 'Unresolved caption typography rule');
  const logoAsset = rules.video?.logoPlacement?.assetReferenceId;
  if (
    logoAsset &&
    !rules.assets.some((a) => a.id === logoAsset && a.role === 'logo')
  )
    issue(ctx, 'Unresolved logo placement asset');
}
