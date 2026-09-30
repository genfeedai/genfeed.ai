import { z } from 'zod';
import { brandRemixScenePipelineSchema } from './brand-remix-scene.contract';
import {
  storyboardImportedPresentationSchema,
  storyboardMigrationMetadataSchema,
  storyboardMigrationReviewSchema,
} from './storyboard-migration.contract';
import {
  storyboardImportedPlanSchema,
  storyboardPlanSchema,
  storyboardPlanSettingsSchema,
} from './storyboard-plan.contract';
import { storyboardRunQuoteSchema } from './storyboard-run-quote.contract';
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
    migrationReview: z.null().optional(),
    importedPresentation: z.null().optional(),
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
    error: z.string().max(1_000).optional(),
  })
  .strict();
export const storyboardMigratedRunConfigSchema = storyboardNativeRunConfigSchema
  .extend({
    origin: z.literal('migrated'),
    clientRequestId: z.string().uuid().nullable(),
    createdByUserId: storyboardIdSchema.nullable(),
    submittedInputHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    migration: storyboardMigrationMetadataSchema,
    migrationReview: storyboardMigrationReviewSchema,
    importedPresentation: storyboardImportedPresentationSchema.nullable(),
    plan: storyboardImportedPlanSchema.nullable(),
    generatedPlan: storyboardImportedPlanSchema.optional(),
  })
  .strict();
export const storyboardRunConfigSchema = z
  .union([storyboardNativeRunConfigSchema, storyboardMigratedRunConfigSchema])
  .superRefine((config, ctx) => {
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
    migrationReview: storyboardMigrationReviewSchema.nullable().optional(),
    importedPresentation: storyboardImportedPresentationSchema
      .nullable()
      .optional(),
  })
  .strict();
export const createStoryboardRunSchema = z
  .object({
    clientRequestId: z.string().uuid(),
    source: storyboardSourceSelectorSchema,
    planSettings: storyboardPlanSettingsSchema.optional(),
  })
  .strict();
export const controlStoryboardRunSchema = z
  .object({ expectedRevision: z.number().int().positive() })
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
export type ResetStoryboardPlan = ControlStoryboardRun;
export type ApproveStoryboardPlan = ControlStoryboardRun;
export type UpdateStoryboardSource = z.infer<
  typeof updateStoryboardSourceSchema
>;
