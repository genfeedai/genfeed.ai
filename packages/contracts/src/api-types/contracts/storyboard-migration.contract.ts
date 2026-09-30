import { z } from 'zod';
import { storyboardIdSchema } from './storyboard-source.contract';

export const storyboardMigrationIssueSchema = z
  .object({
    code: z.enum([
      'LEGACY_PLAN_UNREPRESENTABLE',
      'LEGACY_RUNTIME_EXCEEDED',
      'LEGACY_DIALOGUE_TOO_LONG',
      'LEGACY_CAST_LIMIT_EXCEEDED',
      'LEGACY_STAGE_IDENTITY_MISSING',
      'LEGACY_MODEL_UNRESOLVED',
    ]),
    path: z.string(),
  })
  .strict();
export const storyboardMigrationReviewSchema = z
  .object({
    status: z.enum(['clear', 'required']),
    issues: z.array(storyboardMigrationIssueSchema),
  })
  .strict()
  .refine(
    (value) => (value.status === 'clear') === (value.issues.length === 0),
  );
export const storyboardMigrationMetadataSchema = z
  .object({
    version: z.literal(1),
    sourceContract: z.literal('brand-remix-run'),
    sourceVersion: z.literal(1),
    sourceConfigHash: z.string().regex(/^[a-f0-9]{64}$/),
    migratedAt: z.string().datetime(),
    converterVersion: z.literal(1),
  })
  .strict();
export const storyboardImportedPresentationSchema = z
  .object({
    title: z.string().nullable(),
    outputKind: z.string(),
    shots: z.array(
      z
        .object({
          id: storyboardIdSchema.nullable(),
          ordinal: z.number().int().positive(),
          action: z.string(),
          dialogue: z.string().nullable(),
          durationSeconds: z.number().finite().positive().nullable(),
          stillAssetId: storyboardIdSchema.nullable(),
        })
        .strict(),
    ),
    outputAssetIds: z.array(storyboardIdSchema),
  })
  .strict();
export type StoryboardMigrationIssue = z.infer<
  typeof storyboardMigrationIssueSchema
>;
export type StoryboardMigrationReview = z.infer<
  typeof storyboardMigrationReviewSchema
>;
export type StoryboardImportedPresentation = z.infer<
  typeof storyboardImportedPresentationSchema
>;
