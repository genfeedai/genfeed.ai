import { z } from 'zod';
import {
  STORYBOARD_SLIDESHOW_LIMITS,
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
 * The slideshow tools (#8896), shared by the MCP server and the in-app agent:
 * one free tool for reads, edits, quotes and the draft post, and one
 * hash-bound tool that starts the quoted, paid slide images. Nothing here
 * schedules or publishes; the draft post waits for the user.
 */
const scope = { brandId: storyboardIdSchema };
const run = { ...scope, runId: storyboardIdSchema };
const expectedRevision = z.number().int().positive();
const slideIds = z
  .array(storyboardIdSchema)
  .min(1)
  .max(STORYBOARD_SLIDESHOW_LIMITS.maxSlides)
  .refine(
    (ids) => new Set(ids).size === ids.length,
    'Slide IDs must be unique.',
  );

export const storyboardSlideshowToolSchema = z.discriminatedUnion('action', [
  z
    .object({
      ...scope,
      action: z.literal('create'),
      clientRequestId: z.string().uuid(),
      /** The idea the slides illustrate. */
      brief: z
        .string()
        .trim()
        .min(1)
        .max(STORYBOARD_SHORT_BRIEF_MAX_CHARACTERS),
      /** Images every slide is drawn in the style of (consistency across slides). */
      styleReferenceAssetIds: z.array(storyboardIdSchema).max(20).optional(),
      /** Recurring people or products, each kept consistent from its reference images. */
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
      action: z.literal('edit_slides'),
      expectedRevision,
      title: z.string().trim().min(1).max(120).optional(),
      caption: z.string().trim().max(300).optional(),
      slides: z
        .array(
          z
            .object({
              id: storyboardIdSchema,
              description: storyboardShotSchema.shape.action
                .min(1)
                .max(1_000)
                .optional(),
              sectionLabel: z.string().trim().max(40).optional(),
            })
            .strict(),
        )
        .max(STORYBOARD_SLIDESHOW_LIMITS.maxSlides)
        .optional(),
      /** Every slide id, in the new swipe order. Slides left out are removed. */
      order: slideIds.optional(),
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
      slideIds: slideIds.optional(),
    })
    .strict(),
  z.object({ ...run, action: z.literal('reconcile') }).strict(),
  controlStoryboardRunSchema
    .extend({ ...run, action: z.literal('save_draft_post') })
    .strict(),
]);

export const startStoryboardSlideshowToolSchema = z
  .object({
    ...run,
    expectedRevision,
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    slideIds: slideIds.optional(),
  })
  .strict();

/** The draft post made from an approved slideshow, as the API returns it. */
export const storyboardSlideshowPostSchema = z
  .object({
    /** True when this revision already had a draft, so nothing new was made. */
    isExisting: z.boolean(),
    postId: storyboardIdSchema,
    slideCount: z.number().int().positive(),
  })
  .strict();
export type StoryboardSlideshowPost = z.infer<
  typeof storyboardSlideshowPostSchema
>;

export type StoryboardSlideshowToolInput = z.infer<
  typeof storyboardSlideshowToolSchema
>;
export type StartStoryboardSlideshowToolInput = z.infer<
  typeof startStoryboardSlideshowToolSchema
>;
type StoryboardSlideshowEdits = Extract<
  StoryboardSlideshowToolInput,
  { action: 'edit_slides' }
>;

/**
 * Applies title, caption, slide text, order and removals to the saved plan.
 * A changed description drops the slide's image to stale in the Storyboard's
 * own edit step, since the image no longer matches.
 */
export function editStoryboardSlideshow(
  plan: StoryboardPlan,
  edits: Pick<
    StoryboardSlideshowEdits,
    'title' | 'caption' | 'slides' | 'order'
  >,
): StoryboardPlan {
  if (plan.kind !== 'slideshow')
    throw new Error('This storyboard is not a slideshow.');
  const byId = new Map(plan.shots.map((shot) => [shot.id, shot]));
  const unknown = [
    ...(edits.slides ?? []).map((slide) => slide.id),
    ...(edits.order ?? []),
  ].filter((id) => !byId.has(id));
  if (unknown.length > 0)
    throw new Error(`Unknown slide ids: ${[...new Set(unknown)].join(', ')}`);
  const changes = new Map(
    (edits.slides ?? []).map((slide) => [slide.id, slide]),
  );
  const ordered = edits.order
    ? edits.order.map((id) => byId.get(id))
    : plan.shots;
  const shots = ordered.flatMap((shot, index) => {
    if (!shot) return [];
    const change = changes.get(shot.id);
    return [
      {
        ...shot,
        ordinal: index + 1,
        ...(change?.description === undefined
          ? {}
          : { action: change.description }),
        ...(change?.sectionLabel === undefined
          ? {}
          : { sectionLabel: change.sectionLabel }),
      },
    ];
  });
  return {
    ...plan,
    ...(edits.title === undefined ? {} : { title: edits.title }),
    ...(edits.caption === undefined ? {} : { logline: edits.caption }),
    shots,
  };
}
