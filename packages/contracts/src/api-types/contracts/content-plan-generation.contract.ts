/**
 * Schema-enforced shape of the content planner's model answer (#4873).
 *
 * `type` is the `ContentPlanItemType` enum, so the planner no longer has to
 * read anything other than `media_pipeline` as a skill item. `platforms`,
 * `skillSlug`, `scheduledAt` and `pipelineSteps` stay optional because the
 * planner fills them from the caller's DTO when the model leaves them out —
 * that is a caller default, not a parse failure being papered over.
 */

import { z } from 'zod';
import { ContentPlanItemType } from '../..';

export const contentPlanPipelineStepSchema = z.object({
  aspectRatio: z.string().nullish(),
  model: z.string().min(1),
  prompt: z.string().nullish(),
  type: z.string().min(1),
});

export const contentPlanGenerationItemSchema = z.object({
  pipelineSteps: z.array(contentPlanPipelineStepSchema).nullish(),
  platforms: z.array(z.string()).nullish(),
  prompt: z.string().min(1),
  scheduledAt: z.string().nullish(),
  skillSlug: z.string().nullish(),
  topic: z.string().min(1),
  type: z.enum(ContentPlanItemType),
});

export const contentPlanGenerationSchema = z.object({
  items: z.array(contentPlanGenerationItemSchema).min(1),
  name: z.string().min(1),
});

export type ContentPlanGenerationItem = z.infer<
  typeof contentPlanGenerationItemSchema
>;
export type ContentPlanGeneration = z.infer<typeof contentPlanGenerationSchema>;

export const CONTENT_PLAN_GENERATION_SCHEMA_NAME = 'content_plan_generation';
