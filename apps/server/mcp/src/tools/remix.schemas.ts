import { executeBrandRemixGenerationSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-generation.contract';
import {
  reviseBrandRemixRunSchema,
  sourcePostRemixSourceSelectorSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { attachBrandRemixAnalysisSourceSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-scene.contract';
import { z } from 'zod';

const opaqueId = sourcePostRemixSourceSelectorSchema.shape.sourcePostId;
const run = { runId: opaqueId };
export const remixToolSchemas = {
  import_source_post: z
    .object({
      brandId: opaqueId,
      url: z
        .string()
        .url()
        .max(512)
        .refine((url) => /^https?:\/\//i.test(url), 'Use an HTTP(S) post URL'),
    })
    .strict(),
  create_remix_concept: z
    .object({ brandId: opaqueId, sourcePostId: opaqueId })
    .strict(),
  get_remix_run: z.object(run).strict(),
  update_remix_concept: reviseBrandRemixRunSchema.extend(run).strict(),
  attach_remix_analysis_source: attachBrandRemixAnalysisSourceSchema
    .extend(run)
    .strict(),
  quote_remix_generation: z
    .object({
      ...run,
      expectedRevision: z.number().int().positive(),
      operation: z.enum(['analysis', 'generate', 'repair']),
      model: z.string().trim().min(1).max(200).optional(),
      sceneId: z.string().trim().min(1).max(200).optional(),
      repairStage: z.enum(['image', 'video']).optional(),
    })
    .strict(),
  start_remix_generation: executeBrandRemixGenerationSchema
    .extend(run)
    .strict(),
  control_remix_generation: z
    .object({
      ...run,
      expectedRevision: z.number().int().positive(),
      action: z.enum(['cancel', 'resume']),
    })
    .strict(),
};
export type RemixToolName = keyof typeof remixToolSchemas;
export type RemixToolInput<Name extends RemixToolName> = z.infer<
  (typeof remixToolSchemas)[Name]
>;
