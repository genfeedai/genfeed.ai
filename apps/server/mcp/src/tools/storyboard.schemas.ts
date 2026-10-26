import { replaceStoryboardCharacterSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-character-replace.contract';
import {
  STORYBOARD_LONG_FORM_LIMITS,
  storyboardCutawaySchema,
  storyboardSegmentSchema,
  updateStoryboardPlanSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import {
  controlStoryboardRunSchema,
  createStoryboardRunSchema,
  draftStoryboardPlanSchema,
  updateStoryboardSourceSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  controlStoryboardOperationSchema,
  createStoryboardRunQuoteSchema,
  executeStoryboardRunSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run-quote.contract';
import { listStoryboardRunsSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-run-summary.contract';
import {
  STORYBOARD_LONG_BRIEF_MAX_CHARACTERS,
  storyboardIdSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-source.contract';
import { storyboardCutawayIdsSchema } from '@genfeedai/contracts/api-types/contracts/storyboard-still.contract';
import { z } from 'zod';

const scope = { brandId: storyboardIdSchema };
const run = { ...scope, runId: storyboardIdSchema };
const expectedRevision = z.number().int().positive();

/** The paid steps of a long-form video, each quoted before it runs. */
export const STORYBOARD_LONG_FORM_STAGES = [
  'cutaways',
  'animatic',
  'presenter',
] as const;
const longFormStage = z.enum(STORYBOARD_LONG_FORM_STAGES);

const storyboardLongFormSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...scope,
      action: z.literal('create'),
      clientRequestId: z.string().uuid(),
      /** The voice-note transcript or written idea dump. */
      brief: z.string().trim().min(1).max(STORYBOARD_LONG_BRIEF_MAX_CHARACTERS),
    })
    .strict(),
  z.object({ ...run, action: z.literal('get') }).strict(),
  draftStoryboardPlanSchema
    .extend({ ...run, action: z.literal('draft_plan') })
    .strict(),
  z
    .object({
      ...run,
      action: z.literal('edit_script'),
      expectedRevision,
      segments: z
        .array(
          storyboardSegmentSchema
            .pick({ id: true, sectionLabel: true, narration: true })
            .partial({ sectionLabel: true, narration: true }),
        )
        .max(STORYBOARD_LONG_FORM_LIMITS.maxSegments)
        .optional(),
      cutaways: z
        .array(
          storyboardCutawaySchema
            .pick({ id: true, brief: true })
            .partial({ brief: true }),
        )
        .max(
          STORYBOARD_LONG_FORM_LIMITS.maxSegments *
            STORYBOARD_LONG_FORM_LIMITS.maxCutawaysPerSegment,
        )
        .optional(),
    })
    .strict(),
  controlStoryboardRunSchema
    .extend({ ...run, action: z.literal('approve_plan') })
    .strict(),
  z
    .object({
      ...run,
      action: z.literal('quote'),
      expectedRevision,
      stage: longFormStage,
      cutawayIds: storyboardCutawayIdsSchema.optional(),
    })
    .strict(),
  z.object({ ...run, action: z.literal('reconcile') }).strict(),
  z
    .object({
      ...run,
      action: z.literal('assemble'),
      track: z.enum(['animatic', 'final']),
    })
    .strict(),
]);

const renderStoryboardLongFormSchema = z
  .object({
    ...run,
    stage: longFormStage,
    expectedRevision,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    cutawayIds: storyboardCutawayIdsSchema.optional(),
  })
  .strict()
  .refine(
    (input) => (input.stage === 'cutaways') === Boolean(input.cutawayIds),
    'Pass the quoted cutawayIds for cutaways, and only for cutaways.',
  );
// Exported schemas do not register unfinished paid tools. API ownership gates remain authoritative.
export const storyboardToolSchemas = {
  create_storyboard_remix: z
    .object({
      ...scope,
      assetId: storyboardIdSchema,
      clientRequestId: z.string().uuid(),
    })
    .strict(),
  replace_storyboard_character: replaceStoryboardCharacterSchema
    .extend({ ...run, shotId: storyboardIdSchema })
    .strict(),
  storyboard_run_capabilities: z.object(run).strict(),
  storyboard_long_form: storyboardLongFormSchema,
  start_storyboard_long_form: renderStoryboardLongFormSchema,
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
