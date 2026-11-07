import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

/**
 * The curated image assets a realistic video is made from (#9616): who is in
 * it (a face for identity, a body for build and costume), the props that must
 * look the same in every shot, and the places. Each entry keeps its candidate
 * variants and the one the creator chose.
 */
export const STORYBOARD_ASSET_KINDS = [
  'character_face',
  'character_body',
  'prop',
  'environment',
] as const;
export const storyboardAssetKindSchema = z.enum(STORYBOARD_ASSET_KINDS);

/** How a character sheet is lit: a studio backdrop, or an empty outdoor place. */
export const storyboardSheetEnvironmentSchema = z.enum(['neutral', 'outdoor']);

export const STORYBOARD_ASSET_BIBLE_LIMITS = {
  maxEntries: 40,
  maxVariants: 24,
  maxSources: 8,
  maxVariantsPerCall: 4,
  maxAngles: 6,
} as const;

export const storyboardAssetEntrySchema = z
  .object({
    id: storyboardIdSchema,
    kind: storyboardAssetKindSchema,
    label: z.string().trim().min(1).max(60),
    /** The cast member a face or body belongs to. */
    castMemberId: storyboardIdSchema.optional(),
    /** What to make: the costume, the prop's design, the place. */
    brief: z.string().trim().max(1_000).optional(),
    /**
     * Images the creator supplied: real photos of a person, or reference
     * stills of a place. A real person's photos stay their face.
     */
    sourceAssetIds: z
      .array(storyboardIdSchema)
      .max(STORYBOARD_ASSET_BIBLE_LIMITS.maxSources),
    variantAssetIds: z
      .array(storyboardIdSchema)
      .max(STORYBOARD_ASSET_BIBLE_LIMITS.maxVariants),
    chosenAssetId: storyboardIdSchema.optional(),
    /** Character bodies only; the realistic recipe defaults to outdoor. */
    sheetEnvironment: storyboardSheetEnvironmentSchema.optional(),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (
      entry.chosenAssetId &&
      !entry.variantAssetIds.includes(entry.chosenAssetId) &&
      !entry.sourceAssetIds.includes(entry.chosenAssetId)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['chosenAssetId'],
        message: 'Choose one of the entry’s own images.',
      });
    const isCharacter =
      entry.kind === 'character_face' || entry.kind === 'character_body';
    if (!isCharacter && entry.castMemberId)
      ctx.addIssue({
        code: 'custom',
        path: ['castMemberId'],
        message: 'Only a face or body belongs to a cast member.',
      });
    if (entry.kind !== 'character_body' && entry.sheetEnvironment)
      ctx.addIssue({
        code: 'custom',
        path: ['sheetEnvironment'],
        message: 'Only a character body has a sheet environment.',
      });
  });
export const storyboardAssetBibleSchema = z
  .array(storyboardAssetEntrySchema)
  .max(STORYBOARD_ASSET_BIBLE_LIMITS.maxEntries);

/**
 * What one generation call makes for an entry:
 * - `variants`: new candidates from the brief and the entry's sources.
 * - `angles`: the chosen image seen from other angles.
 * - `costume`: a real person's photo dressed in the chosen costume.
 * - `edit`: the chosen place changed by an instruction, structure kept.
 */
export const storyboardAssetActionSchema = z.enum([
  'variants',
  'angles',
  'costume',
  'edit',
]);

const assetRequestFields = {
  expectedRevision: z.number().int().positive(),
  entryId: storyboardIdSchema,
  action: storyboardAssetActionSchema,
  count: z
    .number()
    .int()
    .min(1)
    .max(STORYBOARD_ASSET_BIBLE_LIMITS.maxVariantsPerCall)
    .optional(),
  angles: z
    .array(z.string().trim().min(1).max(60))
    .min(1)
    .max(STORYBOARD_ASSET_BIBLE_LIMITS.maxAngles)
    .optional(),
  instruction: z.string().trim().min(1).max(1_000).optional(),
};

export const quoteStoryboardAssetsSchema = z
  .object(assetRequestFields)
  .strict();
export const startStoryboardAssetsSchema = z
  .object({
    ...assetRequestFields,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const storyboardAssetQuoteSchema = z
  .object({
    revision: z.number().int().positive(),
    entryId: storyboardIdSchema,
    action: storyboardAssetActionSchema,
    /** The realistic-video recipe step the model was routed for. */
    stepId: z.string().min(1),
    modelKey: z.string().min(1),
    billingMode: z.enum(['platform', 'byok']),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    items: z.array(
      z
        .object({
          prompt: z.string().min(1),
          referenceAssetIds: z.array(storyboardIdSchema),
          credits: z.number().finite().nonnegative(),
        })
        .strict(),
    ),
    total: z.number().finite().nonnegative(),
  })
  .strict();

/** One asset generation, as the run shows it. Derived, never stored. */
export const storyboardAssetGenerationSchema = z
  .object({
    operationId: z.string().uuid(),
    entryId: storyboardIdSchema,
    action: storyboardAssetActionSchema,
    modelKey: z.string().min(1),
    state: z.enum(['pending', 'submitted', 'ready', 'failed']),
    assetId: storyboardIdSchema.optional(),
    credits: z.number().finite().nonnegative(),
    billingMode: z.enum(['platform', 'byok']),
    errorCode: z.string().max(200).optional(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export const STORYBOARD_ASSET_SOURCE_ACTION_PREFIX = 'storyboard-asset-';

export type StoryboardAssetKind = z.infer<typeof storyboardAssetKindSchema>;
export type StoryboardSheetEnvironment = z.infer<
  typeof storyboardSheetEnvironmentSchema
>;
export type StoryboardAssetEntry = z.infer<typeof storyboardAssetEntrySchema>;
export type StoryboardAssetAction = z.infer<typeof storyboardAssetActionSchema>;
export type QuoteStoryboardAssets = z.infer<typeof quoteStoryboardAssetsSchema>;
export type StartStoryboardAssets = z.infer<typeof startStoryboardAssetsSchema>;
export type StoryboardAssetQuote = z.infer<typeof storyboardAssetQuoteSchema>;
export type StoryboardAssetGeneration = z.infer<
  typeof storyboardAssetGenerationSchema
>;
