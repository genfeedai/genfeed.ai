import { z } from 'zod';
import {
  STORYBOARD_LONG_FORM_LIMITS,
  type StoryboardPlan,
  storyboardCutawaySchema,
  storyboardSegmentSchema,
} from './storyboard-plan.contract';
import {
  controlStoryboardRunSchema,
  draftStoryboardPlanSchema,
  translateStoryboardRunSchema,
} from './storyboard-run.contract';
import {
  STORYBOARD_LONG_BRIEF_MAX_CHARACTERS,
  storyboardIdSchema,
} from './storyboard-source.contract';
import { storyboardCutawayIdsSchema } from './storyboard-still.contract';

/**
 * The long-form storyboard tools (#8225), shared by the MCP server and the
 * in-app agent: one free tool for reads, edits, quotes and assembly, and one
 * hash-bound tool that starts a quoted paid step.
 */
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

export const storyboardLongFormToolSchema = z.discriminatedUnion('action', [
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
  z
    .object({ ...run, action: z.literal('estimate'), expectedRevision })
    .strict(),
  translateStoryboardRunSchema
    .extend({ ...run, action: z.literal('translate') })
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

export const startStoryboardLongFormToolSchema = z
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

export type StoryboardLongFormToolInput = z.infer<
  typeof storyboardLongFormToolSchema
>;
export type StartStoryboardLongFormToolInput = z.infer<
  typeof startStoryboardLongFormToolSchema
>;
export type StoryboardLongFormStage =
  (typeof STORYBOARD_LONG_FORM_STAGES)[number];
type StoryboardScriptEdits = Extract<
  StoryboardLongFormToolInput,
  { action: 'edit_script' }
>;

/**
 * Applies narration and cutaway brief edits to the saved plan. A changed brief
 * drops the cutaway's footage, as in the Storyboard, since it no longer matches.
 */
export function editStoryboardLongFormScript(
  plan: StoryboardPlan,
  edits: Pick<StoryboardScriptEdits, 'segments' | 'cutaways'>,
): StoryboardPlan {
  const longForm = plan.longForm;
  if (!longForm) throw new Error('This storyboard is not a long-form video.');
  const segmentEdits = new Map(
    (edits.segments ?? []).map((edit) => [edit.id, edit]),
  );
  const cutawayEdits = new Map(
    (edits.cutaways ?? []).map((edit) => [edit.id, edit]),
  );
  const segments = longForm.segments.map((segment) => {
    const segmentEdit = segmentEdits.get(segment.id);
    segmentEdits.delete(segment.id);
    return {
      ...segment,
      ...(segmentEdit?.narration === undefined
        ? {}
        : { narration: segmentEdit.narration }),
      ...(segmentEdit?.sectionLabel === undefined
        ? {}
        : { sectionLabel: segmentEdit.sectionLabel }),
      cutaways: segment.cutaways.map((cutaway) => {
        const cutawayEdit = cutawayEdits.get(cutaway.id);
        cutawayEdits.delete(cutaway.id);
        if (
          cutawayEdit?.brief === undefined ||
          cutawayEdit.brief === cutaway.brief
        )
          return cutaway;
        const { assetId: _assetId, ...rest } = cutaway;
        return { ...rest, brief: cutawayEdit.brief };
      }),
    };
  });
  const unknown = [...segmentEdits.keys(), ...cutawayEdits.keys()];
  if (unknown.length > 0)
    throw new Error(`Unknown segment or cutaway ids: ${unknown.join(', ')}`);
  return { ...plan, longForm: { ...longForm, segments } };
}
