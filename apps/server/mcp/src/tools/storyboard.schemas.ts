import { updateStoryboardPlanSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import {
  controlStoryboardRunSchema,
  createStoryboardRunSchema,
  updateStoryboardSourceSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  controlStoryboardOperationSchema,
  createStoryboardRunQuoteSchema,
  executeStoryboardRunSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run-quote.contract';
import { listStoryboardRunsSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run-summary.contract';
import { storyboardIdSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import { z } from 'zod';

const scope = { brandId: storyboardIdSchema };
const run = { ...scope, runId: storyboardIdSchema };
// Exported schemas do not register unfinished paid tools. API ownership gates remain authoritative.
export const storyboardToolSchemas = {
  storyboard_run_capabilities: z.object(run).strict(),
  storyboard_run_create: createStoryboardRunSchema.extend(scope).strict(),
  storyboard_run_list: listStoryboardRunsSchema.extend(scope).strict(),
  storyboard_run_get: z.object(run).strict(),
  storyboard_plan_update: updateStoryboardPlanSchema.extend(run).strict(),
  storyboard_plan_reset: controlStoryboardRunSchema.extend(run).strict(),
  storyboard_plan_approve: controlStoryboardRunSchema.extend(run).strict(),
  storyboard_source_update: updateStoryboardSourceSchema.extend(run).strict(),
  storyboard_run_quote: createStoryboardRunQuoteSchema.safeExtend(run).strict(),
  storyboard_run_execute: executeStoryboardRunSchema.extend(run).strict(),
  storyboard_run_cancel: controlStoryboardOperationSchema.extend(run).strict(),
  storyboard_run_resume: controlStoryboardOperationSchema.extend(run).strict(),
};
export type StoryboardToolName = keyof typeof storyboardToolSchemas;
export type StoryboardToolInput<Name extends StoryboardToolName> = z.infer<
  (typeof storyboardToolSchemas)[Name]
>;
