import { z } from 'zod';
import {
  brandRemixOutputKindValues,
  brandRemixPhaseValues,
} from './brand-remix-run.contract';
import { brandRemixScenePipelineSchema } from './brand-remix-scene.contract';

/**
 * Where a storyboard run's shots come from. Discovery remixes are the only
 * source the pipeline produces today; brief (#5454) and uploaded-video (#5455)
 * sources join this list as those pipelines land.
 */
export const storyboardRunSourceKindValues = [
  'brief',
  'remix_discovery',
  'remix_upload',
] as const;

export const brandRemixRunListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    page: z.coerce.number().int().min(1).default(1),
  })
  .strict();

/** One row of Studio → Storyboard's saved runs list. */
export const brandRemixRunSummarySchema = z
  .object({
    brandId: z.string().min(1),
    createdAt: z.string().datetime(),
    id: z.string().min(1),
    outputKind: z.enum(brandRemixOutputKindValues),
    phase: z.enum(brandRemixPhaseValues),
    runtimeSeconds: z.number().nonnegative().nullable(),
    scenePipelineState: brandRemixScenePipelineSchema.shape.state.optional(),
    shotCount: z.number().int().nonnegative(),
    sourceKind: z.enum(storyboardRunSourceKindValues),
    title: z.string().min(1),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type StoryboardRunSourceKind =
  (typeof storyboardRunSourceKindValues)[number];
export type BrandRemixRunListQuery = z.infer<
  typeof brandRemixRunListQuerySchema
>;
export type BrandRemixRunSummary = z.infer<typeof brandRemixRunSummarySchema>;
