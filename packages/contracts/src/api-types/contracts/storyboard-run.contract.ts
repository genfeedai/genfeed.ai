import { z } from 'zod';
import { brandRemixScenePipelineSchema } from './brand-remix-scene.contract';
import { storyboardARollSchema } from './storyboard-a-roll.contract';
import { storyboardCharacterReplacementSchema } from './storyboard-character-replace.contract';
import {
  storyboardPlanSchema,
  storyboardPlanSettingsSchema,
} from './storyboard-plan.contract';
import {
  storyboardOperationProjectionSchema,
  storyboardRunQuoteSchema,
} from './storyboard-run-quote.contract';
import {
  storyboardIdSchema,
  storyboardSourceSelectorSchema,
  storyboardSourceSnapshotSchema,
} from './storyboard-source.contract';

export const STORYBOARD_RUN_CONTRACT = 'storyboard-run';
export const STORYBOARD_RUN_VERSION = 1;
export const storyboardRunStateSchema = z.enum([
  'planning',
  'awaiting_analysis',
  'analysing',
  'storyboard',
  'approved',
  'quoted',
  'generating',
  'assembling',
  'ready',
  'partial_failure',
  'cancelled',
  'blocked',
]);
export const storyboardNativeRunConfigSchema = z
  .object({
    origin: z.literal('native').default('native'),
    contract: z.literal(STORYBOARD_RUN_CONTRACT),
    version: z.literal(STORYBOARD_RUN_VERSION),
    revision: z.number().int().positive(),
    clientRequestId: z.string().uuid(),
    createdByUserId: storyboardIdSchema,
    submittedInputHash: z.string().regex(/^[a-f0-9]{64}$/),
    approvedRevision: z.number().int().positive().optional(),
    state: storyboardRunStateSchema,
    sourceSnapshot: storyboardSourceSnapshotSchema,
    plan: storyboardPlanSchema,
    generatedPlan: storyboardPlanSchema.optional(),
    quote: storyboardRunQuoteSchema.optional(),
    scenePipeline: brandRemixScenePipelineSchema.optional(),
    /** The long-form presenter track, rendered in chunks (#8222). */
    aRoll: storyboardARollSchema.optional(),
    /**
     * The cheap draft of the same narration (#8232): speech only, played
     * under the presenter's photo, so pacing is checked before the render.
     */
    animatic: storyboardARollSchema.optional(),
    characterReplacements: z
      .array(storyboardCharacterReplacementSchema)
      .max(12)
      .optional(),
    error: z.string().max(1_000).optional(),
  })
  .strict();
export const storyboardRunConfigSchema =
  storyboardNativeRunConfigSchema.superRefine((config, ctx) => {
    if (
      config.approvedRevision !== undefined &&
      config.approvedRevision !== config.revision
    )
      ctx.addIssue({
        code: 'custom',
        path: ['approvedRevision'],
        message: 'Approval must match the current revision.',
      });
    if (config.quote && config.quote.revision !== config.revision)
      ctx.addIssue({
        code: 'custom',
        path: ['quote'],
        message: 'Quote must match the current revision.',
      });
  });
export const storyboardRunSchema = z
  .object({
    id: storyboardIdSchema,
    organizationId: storyboardIdSchema,
    brandId: storyboardIdSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    config: storyboardRunConfigSchema,
    operation: storyboardOperationProjectionSchema.nullable().optional(),
  })
  .strict();
export const createStoryboardRunSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    source: storyboardSourceSelectorSchema,
    planSettings: storyboardPlanSettingsSchema.optional(),
  })
  .strict();
/** Languages a long-form video can be remade in; the presenter voices speak all of them. */
export const STORYBOARD_TRANSLATION_LANGUAGES = [
  'en',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'tr',
  'ja',
  'ko',
  'zh',
  'hi',
  'ar',
] as const;
export const storyboardTranslationLanguageSchema = z.enum(
  STORYBOARD_TRANSLATION_LANGUAGES,
);
/** Copies a long-form storyboard into a new one with its script in another language. */
export const translateStoryboardRunSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    expectedRevision: z.number().int().positive(),
    language: storyboardTranslationLanguageSchema,
  })
  .strict();
export const controlStoryboardRunSchema = z
  .object({ expectedRevision: z.number().int().positive() })
  .strict();
/** Drafts a plan from the brief, or revises the current plan when `instruction` is set. */
export const draftStoryboardPlanSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    instruction: z.string().trim().min(1).max(2_000).optional(),
  })
  .strict();
export const updateStoryboardSourceSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    source: storyboardSourceSelectorSchema,
  })
  .strict();
export type StoryboardNativeRunConfig = z.infer<
  typeof storyboardNativeRunConfigSchema
>;
export type StoryboardRunConfig = z.infer<typeof storyboardRunConfigSchema>;
export type StoryboardRun = z.infer<typeof storyboardRunSchema>;
export type CreateStoryboardRun = z.infer<typeof createStoryboardRunSchema>;
export type ControlStoryboardRun = z.infer<typeof controlStoryboardRunSchema>;
export type StoryboardTranslationLanguage = z.infer<
  typeof storyboardTranslationLanguageSchema
>;
export type TranslateStoryboardRun = z.infer<
  typeof translateStoryboardRunSchema
>;
export type ResetStoryboardPlan = ControlStoryboardRun;
export type ApproveStoryboardPlan = ControlStoryboardRun;
export type DraftStoryboardPlan = z.infer<typeof draftStoryboardPlanSchema>;
export type UpdateStoryboardSource = z.infer<
  typeof updateStoryboardSourceSchema
>;
