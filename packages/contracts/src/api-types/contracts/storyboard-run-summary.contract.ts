import { z } from 'zod';
import { storyboardRunStateSchema } from './storyboard-run.contract';
import { storyboardIdSchema } from './storyboard-source.contract';

export const listStoryboardRunsSchema = z
  .object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const storyboardRunSummarySchema = z
  .object({
    id: storyboardIdSchema,
    brandId: storyboardIdSchema,
    title: z.string().max(120),
    sourceLabel: z.enum(['brief', 'remix_upload', 'remix_discovery']),
    shotCount: z.number().int().min(0).max(12),
    runtimeSeconds: z.number().nonnegative().max(60),
    runtimeBudgetSeconds: z.number().positive().max(60).nullable(),
    approvalState: z.enum(['draft', 'approved']),
    state: storyboardRunStateSchema,
    updatedAt: z.string().datetime(),
  })
  .strict();
export type StoryboardRunSummary = z.infer<typeof storyboardRunSummarySchema>;
export type ListStoryboardRuns = z.infer<typeof listStoryboardRunsSchema>;
