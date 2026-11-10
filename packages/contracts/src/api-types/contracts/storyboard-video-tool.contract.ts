import { z } from 'zod';
import {
  STORYBOARD_ASSET_BIBLE_LIMITS,
  type StoryboardAssetEntry,
  storyboardAssetActionSchema,
  storyboardAssetEntrySchema,
} from './storyboard-asset-bible.contract';
import {
  STORYBOARD_SHOT_LIMITS,
  type StoryboardPlan,
  storyboardCastMemberSchema,
  storyboardShotSchema,
} from './storyboard-plan.contract';
import {
  controlStoryboardRunSchema,
  draftStoryboardPlanSchema,
} from './storyboard-run.contract';
import {
  STORYBOARD_SHORT_BRIEF_MAX_CHARACTERS,
  storyboardIdSchema,
} from './storyboard-source.contract';

/**
 * The realistic video tools (#9622), shared by the MCP server and the in-app
 * agent: one free tool for reads, edits, quotes, reconcile and assembly, and
 * one hash-bound tool that starts one quoted paid stage.
 */
const scope = { brandId: storyboardIdSchema };
const run = { ...scope, runId: storyboardIdSchema };
const expectedRevision = z.number().int().positive();
const inputHash = z.string().regex(/^[a-f0-9]{64}$/);
const shotIds = z
  .array(storyboardIdSchema)
  .min(1)
  .max(12)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Shot IDs must be unique.',
  );

/**
 * The paid stages of a realistic video, each quoted before it runs:
 * asset bible images, shot stills (start frames), draft renders, finals.
 */
export const STORYBOARD_VIDEO_STAGES = [
  'assets',
  'stills',
  'draft',
  'final',
] as const;
const videoStage = z.enum(STORYBOARD_VIDEO_STAGES);

/** Which shots, or which asset bible entry and what to make for it. */
const stageTarget = {
  shotIds: shotIds.optional(),
  entryId: storyboardIdSchema.optional(),
  assetAction: storyboardAssetActionSchema.optional(),
  count: z
    .number()
    .int()
    .min(1)
    .max(STORYBOARD_ASSET_BIBLE_LIMITS.maxVariantsPerCall)
    .optional(),
  angles: z
    .array(z.string().trim().min(1).max(60))
    .min(1)
    .max(STORYBOARD_ASSET_BIBLE_LIMITS.maxAngles)
    .optional(),
  instruction: z.string().trim().min(1).max(1_000).optional(),
};
type StageTarget = { stage: StoryboardVideoStage } & {
  [K in keyof typeof stageTarget]?: z.infer<(typeof stageTarget)[K]>;
};

function targetIssue(target: StageTarget): string | undefined {
  const isAssets = target.stage === 'assets';
  if (isAssets && (!target.entryId || !target.assetAction))
    return 'The assets stage needs entryId and assetAction.';
  if (isAssets && target.shotIds) return 'The assets stage takes no shotIds.';
  const hasAssetFields =
    target.entryId !== undefined ||
    target.assetAction !== undefined ||
    target.count !== undefined ||
    target.angles !== undefined ||
    target.instruction !== undefined;
  if (!isAssets && hasAssetFields)
    return 'Only the assets stage takes entryId, assetAction, count, angles or instruction.';
  return undefined;
}

const shotEditSchema = z
  .object({
    id: storyboardIdSchema,
    action: storyboardShotSchema.shape.action.min(1).optional(),
    dialogue: storyboardShotSchema.shape.dialogue,
    durationSeconds: z.number().finite().positive().max(60).optional(),
    cuts: storyboardShotSchema.shape.cuts,
    sfx: storyboardShotSchema.shape.sfx,
    referenceRoles: storyboardShotSchema.shape.referenceRoles,
    /** The exact video prompt; empty or null goes back to the compiled one. */
    videoPrompt: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .min(1)
          .max(STORYBOARD_SHOT_LIMITS.maxVideoPromptCharacters),
      ])
      .nullable()
      .optional(),
  })
  .strict();

/** An asset bible entry to add or change. Variants stay server-owned. */
const { variantAssetIds: _variants, ...assetEntryShape } =
  storyboardAssetEntrySchema.shape;
const assetEditSchema = z
  .object({
    ...assetEntryShape,
    sourceAssetIds: assetEntryShape.sourceAssetIds.optional(),
  })
  .strict();

export const storyboardVideoToolSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...scope,
      action: z.literal('create'),
      clientRequestId: z.string().uuid(),
      /** The idea, script or shot list the video is made from. */
      brief: z
        .string()
        .trim()
        .min(1)
        .max(STORYBOARD_SHORT_BRIEF_MAX_CHARACTERS),
      format: z.enum(['9:16', '16:9', '1:1']).optional(),
      /** Target length of the whole video. */
      runtimeBudgetSeconds: z.number().finite().positive().max(60).optional(),
      styleReferenceAssetIds: z.array(storyboardIdSchema).max(20).optional(),
      /** The people or products that recur, from their reference images. */
      cast: z
        .array(
          storyboardCastMemberSchema.pick({ name: true }).extend({
            referenceAssetIds: z.array(storyboardIdSchema).min(1).max(20),
          }),
        )
        .max(6)
        .optional(),
    })
    .strict(),
  z.object({ ...run, action: z.literal('get') }).strict(),
  draftStoryboardPlanSchema
    .extend({ ...run, action: z.literal('draft_plan') })
    .strict(),
  z
    .object({
      ...run,
      action: z.literal('edit_shots'),
      expectedRevision,
      shots: z.array(shotEditSchema).min(1).max(12),
    })
    .strict(),
  z
    .object({
      ...run,
      action: z.literal('assets'),
      expectedRevision,
      entries: z
        .array(assetEditSchema)
        .max(STORYBOARD_ASSET_BIBLE_LIMITS.maxEntries)
        .optional(),
      removeEntryIds: z.array(storyboardIdSchema).max(40).optional(),
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
      stage: videoStage,
      ...stageTarget,
    })
    .strict()
    .superRefine((input, ctx) => {
      const issue = targetIssue(input);
      if (issue) ctx.addIssue({ code: 'custom', message: issue });
    }),
  z
    .object({ ...run, action: z.literal('estimate'), expectedRevision })
    .strict(),
  z.object({ ...run, action: z.literal('reconcile') }).strict(),
  z.object({ ...run, action: z.literal('assemble') }).strict(),
]);

export const startStoryboardVideoToolSchema = z
  .object({
    ...run,
    stage: videoStage,
    expectedRevision,
    inputHash,
    ...stageTarget,
  })
  .strict()
  .superRefine((input, ctx) => {
    const issue =
      targetIssue(input) ??
      (input.stage !== 'assets' && !input.shotIds
        ? 'Pass the quoted shotIds.'
        : undefined);
    if (issue) ctx.addIssue({ code: 'custom', message: issue });
  });

export type StoryboardVideoStage = (typeof STORYBOARD_VIDEO_STAGES)[number];
export type StoryboardVideoToolInput = z.infer<
  typeof storyboardVideoToolSchema
>;
export type StartStoryboardVideoToolInput = z.infer<
  typeof startStoryboardVideoToolSchema
>;
type ShotEdits = Extract<StoryboardVideoToolInput, { action: 'edit_shots' }>;
type AssetEdits = Extract<StoryboardVideoToolInput, { action: 'assets' }>;

function assertVideoPlan(plan: StoryboardPlan): void {
  if (plan.kind === 'slideshow' || plan.longForm)
    throw new Error('This storyboard is not a shot-by-shot video.');
}

/**
 * Applies shot edits by id. Omitted fields stay; an empty or null
 * `videoPrompt` goes back to the compiled prompt. Still freshness is
 * decided by the plan edit.
 */
export function editStoryboardVideoShots(
  plan: StoryboardPlan,
  edits: ShotEdits['shots'],
): StoryboardPlan {
  assertVideoPlan(plan);
  const changes = new Map(edits.map((edit) => [edit.id, edit]));
  const unknown = [...changes.keys()].filter(
    (id) => !plan.shots.some((shot) => shot.id === id),
  );
  if (unknown.length)
    throw new Error(`Unknown shot ids: ${unknown.join(', ')}`);
  return {
    ...plan,
    shots: plan.shots.map((shot) => {
      const change = changes.get(shot.id);
      if (!change) return shot;
      const { id: _id, videoPrompt, ...fields } = change;
      const defined = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      const { videoPrompt: _previous, ...rest } = shot;
      return {
        ...(videoPrompt === null || videoPrompt === '' ? rest : shot),
        ...defined,
        ...(videoPrompt ? { videoPrompt } : {}),
      };
    }),
  };
}

/**
 * Adds, changes and removes asset bible entries by id. A changed entry keeps
 * its generated variants; omitted fields stay.
 */
export function editStoryboardAssetBible(
  plan: StoryboardPlan,
  edits: Pick<AssetEdits, 'entries' | 'removeEntryIds'>,
): StoryboardPlan {
  assertVideoPlan(plan);
  const removed = new Set(edits.removeEntryIds ?? []);
  const current = (plan.assetBible ?? []).filter(
    (entry) => !removed.has(entry.id),
  );
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  for (const edit of edits.entries ?? []) {
    const previous = byId.get(edit.id);
    const merged: StoryboardAssetEntry = {
      ...previous,
      ...edit,
      sourceAssetIds: edit.sourceAssetIds ?? previous?.sourceAssetIds ?? [],
      variantAssetIds: previous?.variantAssetIds ?? [],
    };
    byId.set(edit.id, merged);
  }
  return { ...plan, assetBible: [...byId.values()] };
}
