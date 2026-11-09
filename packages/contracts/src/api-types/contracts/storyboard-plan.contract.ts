import { z } from 'zod';
import { storyboardModelKeySchema } from './storyboard-run-capabilities.contract';
import { storyboardIdSchema } from './storyboard-source.contract';

export const storyboardCastMemberSchema = z
  .object({
    id: storyboardIdSchema,
    name: z.string().trim().min(1).max(40),
    voiceId: storyboardIdSchema.optional(),
    avatarAssetId: storyboardIdSchema.optional(),
    referenceAssetIds: z.array(storyboardIdSchema).max(20),
  })
  .strict();
/**
 * What a reference image is to the video model (#9617): the place, the face
 * that carries a character's identity, the body and costume, a prop, or the
 * look. The compiled prompt names each image by its role.
 */
export const STORYBOARD_REFERENCE_ROLES = [
  'environment',
  'character_face',
  'character_body',
  'prop',
  'style',
] as const;
export const storyboardReferenceRoleSchema = z.enum(STORYBOARD_REFERENCE_ROLES);
export const storyboardShotReferenceRoleSchema = z
  .object({
    assetId: storyboardIdSchema,
    role: storyboardReferenceRoleSchema,
    /** Who or what the image is, for example the character's name. */
    label: z.string().trim().max(60).optional(),
  })
  .strict();
/** A timed cut inside one generated clip, for example 0-2 s close-up. */
export const storyboardShotCutSchema = z
  .object({
    startSeconds: z.number().finite().min(0).max(60),
    endSeconds: z.number().finite().positive().max(60),
    framing: z.string().trim().min(1).max(200),
    camera: z.string().trim().max(200).optional(),
  })
  .strict();
export const STORYBOARD_SHOT_LIMITS = {
  maxCuts: 8,
  maxSfx: 8,
  maxReferenceRoles: 12,
  maxVideoPromptCharacters: 4_000,
} as const;
export const storyboardShotSchema = z
  .object({
    id: storyboardIdSchema,
    ordinal: z.number().int().min(1).max(12),
    sectionLabel: z.string().trim().max(40).optional(),
    action: z.string().trim().max(4_000),
    dialogue: z.string().trim().max(500).optional(),
    speakerId: storyboardIdSchema.optional(),
    onScreenSpeaker: z.boolean(),
    durationSeconds: z.number().finite().positive().max(60).nullable(),
    notes: z.string().max(1_000).optional(),
    stillAssetId: storyboardIdSchema.optional(),
    stillFreshness: z.enum([
      'fresh',
      'stale',
      'missing',
      'generating',
      'failed',
    ]),
    transition: z.enum(['cut', 'stitch', 'interpolate']),
    cuts: z
      .array(storyboardShotCutSchema)
      .max(STORYBOARD_SHOT_LIMITS.maxCuts)
      .optional(),
    /** Sound-effect lines for models that render native audio. */
    sfx: z
      .array(z.string().trim().min(1).max(200))
      .max(STORYBOARD_SHOT_LIMITS.maxSfx)
      .optional(),
    referenceRoles: z
      .array(storyboardShotReferenceRoleSchema)
      .max(STORYBOARD_SHOT_LIMITS.maxReferenceRoles)
      .optional(),
    /** The person's own video prompt; replaces the compiled one when set. */
    videoPrompt: z
      .string()
      .trim()
      .min(1)
      .max(STORYBOARD_SHOT_LIMITS.maxVideoPromptCharacters)
      .optional(),
  })
  .strict();
/**
 * Long-form plans (#8218) narrate over one continuous presenter track. Each
 * segment is a stretch of narration; cutaways cover parts of it with B-roll
 * while the presenter's audio keeps playing.
 */
export const STORYBOARD_LONG_FORM_LIMITS = {
  maxBriefCharacters: 20_000,
  maxCutawaysPerSegment: 4,
  maxCutawaySeconds: 60,
  maxNarrationCharacters: 2_000,
  maxRuntimeSeconds: 1_800,
  maxSegmentSeconds: 300,
  maxSegments: 150,
} as const;
export const storyboardCutawayKindSchema = z.enum([
  'still',
  'motion_graphic',
  'library_clip',
]);
export const storyboardCutawaySchema = z
  .object({
    id: storyboardIdSchema,
    kind: storyboardCutawayKindSchema,
    brief: z.string().trim().min(1).max(1_000),
    assetId: storyboardIdSchema.optional(),
    /** Seconds into the segment where the cutaway starts covering the presenter. */
    startSeconds: z.number().finite().min(0),
    durationSeconds: z
      .number()
      .finite()
      .positive()
      .max(STORYBOARD_LONG_FORM_LIMITS.maxCutawaySeconds),
  })
  .strict();
export const storyboardSegmentSchema = z
  .object({
    id: storyboardIdSchema,
    ordinal: z
      .number()
      .int()
      .min(1)
      .max(STORYBOARD_LONG_FORM_LIMITS.maxSegments),
    sectionLabel: z.string().trim().max(40).optional(),
    narration: z
      .string()
      .trim()
      .min(1)
      .max(STORYBOARD_LONG_FORM_LIMITS.maxNarrationCharacters),
    /** Spoken length estimated from the narration; the render measures the real one. */
    estimatedSeconds: z
      .number()
      .finite()
      .positive()
      .max(STORYBOARD_LONG_FORM_LIMITS.maxSegmentSeconds),
    cutaways: z
      .array(storyboardCutawaySchema)
      .max(STORYBOARD_LONG_FORM_LIMITS.maxCutawaysPerSegment),
  })
  .strict();
export const storyboardLongFormSchema = z
  .object({
    runtimeBudgetSeconds: z
      .number()
      .finite()
      .positive()
      .max(STORYBOARD_LONG_FORM_LIMITS.maxRuntimeSeconds),
    /** Cast member who presents on camera and speaks the narration. */
    presenterId: storyboardIdSchema.optional(),
    segments: z
      .array(storyboardSegmentSchema)
      .max(STORYBOARD_LONG_FORM_LIMITS.maxSegments),
  })
  .strict();
/**
 * A slideshow (#8896) is a storyboard that stops at stills: each shot is one
 * slide, the stills are the output, and they become one multi-image post in
 * slide order. A plan without a kind is a video.
 */
export const STORYBOARD_SLIDESHOW_LIMITS = {
  maxSlides: 12,
  minSlides: 2,
} as const;
/**
 * The most images an Instagram photo carousel takes, the tightest of the
 * channels a slideshow publishes to. Kept here so the editor can warn without
 * loading the whole channel capability catalog; the contract test pins it to
 * the catalog, which stays the source of truth.
 */
export const STORYBOARD_SLIDESHOW_INSTAGRAM_MAX_SLIDES = 10;
export const storyboardPlanKindSchema = z.enum(['video', 'slideshow']);
export const storyboardPlanSettingsSchema = z
  .object({
    kind: storyboardPlanKindSchema.optional(),
    videoModelKey: storyboardModelKeySchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    format: z.enum(['9:16', '16:9', '1:1', '4:5']),
    runtimeBudgetSeconds: z.number().finite().positive().max(60).nullable(),
    styleLabel: z.string().trim().max(60).optional(),
    styleReferenceAssetIds: z.array(storyboardIdSchema).max(20),
    cast: z.array(storyboardCastMemberSchema).max(6),
  })
  .strict();
export const storyboardPlanDraftSchema = storyboardPlanSettingsSchema
  .extend({
    title: z.string().trim().max(120),
    logline: z.string().trim().max(300),
    shots: z.array(storyboardShotSchema).max(12),
    longForm: storyboardLongFormSchema.optional(),
  })
  .strict();

function validateStoryboardLongForm(
  plan: z.infer<typeof storyboardPlanDraftSchema>,
  ctx: z.RefinementCtx,
) {
  const longForm = plan.longForm;
  if (!longForm) return;
  if (plan.shots.length > 0)
    ctx.addIssue({
      code: 'custom',
      path: ['shots'],
      message: 'A long-form plan uses segments, not shots.',
    });
  if (
    longForm.presenterId &&
    !plan.cast.some((member) => member.id === longForm.presenterId)
  )
    ctx.addIssue({
      code: 'custom',
      path: ['longForm', 'presenterId'],
      message: 'Choose a member of the storyboard cast.',
    });
  if (
    new Set(longForm.segments.map((segment) => segment.id)).size !==
    longForm.segments.length
  )
    ctx.addIssue({
      code: 'custom',
      path: ['longForm', 'segments'],
      message: 'Segment IDs must be unique.',
    });
  if (
    longForm.segments.reduce(
      (sum, segment) => sum + segment.estimatedSeconds,
      0,
    ) > longForm.runtimeBudgetSeconds
  )
    ctx.addIssue({
      code: 'custom',
      path: ['longForm', 'segments'],
      message: 'Shorten the narration or increase the runtime.',
    });
  longForm.segments.forEach((segment, index) => {
    if (segment.ordinal !== index + 1)
      ctx.addIssue({
        code: 'custom',
        path: ['longForm', 'segments', index, 'ordinal'],
        message: 'Segment ordinals must follow the saved order.',
      });
    segment.cutaways.forEach((cutaway, cutawayIndex) => {
      if (cutaway.startSeconds >= segment.estimatedSeconds)
        ctx.addIssue({
          code: 'custom',
          path: ['longForm', 'segments', index, 'cutaways', cutawayIndex],
          message: 'A cutaway must start inside its segment.',
        });
    });
  });
}

/** True when the plan is a slideshow: stills only, posted as a carousel. */
export function isStoryboardSlideshow(plan: {
  kind?: z.infer<typeof storyboardPlanKindSchema>;
}): boolean {
  return plan.kind === 'slideshow';
}

function validateStoryboardSlideshow(
  plan: z.infer<typeof storyboardPlanDraftSchema>,
  ctx: z.RefinementCtx,
) {
  if (!isStoryboardSlideshow(plan)) return;
  if (plan.longForm)
    ctx.addIssue({
      code: 'custom',
      path: ['longForm'],
      message: 'A slideshow cannot be a long-form video.',
    });
  if (plan.runtimeBudgetSeconds !== null)
    ctx.addIssue({
      code: 'custom',
      path: ['runtimeBudgetSeconds'],
      message: 'A slideshow has no runtime.',
    });
  plan.shots.forEach((shot, index) => {
    if (
      shot.durationSeconds !== null ||
      shot.dialogue ||
      shot.speakerId ||
      shot.onScreenSpeaker ||
      shot.transition !== 'cut' ||
      shot.cuts?.length ||
      shot.sfx?.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['shots', index],
        message: 'A slide has no duration, dialogue or transition.',
      });
  });
}

/** Cuts run in order, without overlap, inside the shot. */
function validateStoryboardShotCuts(
  shot: z.infer<typeof storyboardShotSchema>,
  index: number,
  ctx: z.RefinementCtx,
) {
  let previousEnd = 0;
  (shot.cuts ?? []).forEach((cut, cutIndex) => {
    const path = ['shots', index, 'cuts', cutIndex];
    if (cut.startSeconds >= cut.endSeconds)
      ctx.addIssue({
        code: 'custom',
        path,
        message: 'A cut must end after it starts.',
      });
    if (cut.startSeconds < previousEnd)
      ctx.addIssue({
        code: 'custom',
        path,
        message: 'Cuts must follow each other without overlapping.',
      });
    if (shot.durationSeconds !== null && cut.endSeconds > shot.durationSeconds)
      ctx.addIssue({
        code: 'custom',
        path,
        message: 'A cut must end inside its shot.',
      });
    previousEnd = cut.endSeconds;
  });
}

function validateStoryboardPlan(
  plan: z.infer<typeof storyboardPlanDraftSchema>,
  ctx: z.RefinementCtx,
) {
  validateStoryboardSlideshow(plan, ctx);
  validateStoryboardLongForm(plan, ctx);
  if (
    plan.runtimeBudgetSeconds !== null &&
    plan.shots.reduce((sum, shot) => sum + (shot.durationSeconds ?? 0), 0) >
      plan.runtimeBudgetSeconds
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['shots'],
      message: 'Shorten another shot before increasing the runtime.',
    });
  }
  if (new Set(plan.shots.map((shot) => shot.id)).size !== plan.shots.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['shots'],
      message: 'Shot IDs must be unique.',
    });
  }
  if (
    new Set(plan.cast.map((member) => member.id)).size !== plan.cast.length ||
    new Set(plan.cast.map((member) => member.name.toLowerCase())).size !==
      plan.cast.length
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['cast'],
      message: 'Cast IDs and names must be unique.',
    });
  }
  plan.shots.forEach((shot, index) => {
    if (shot.ordinal !== index + 1)
      ctx.addIssue({
        code: 'custom',
        path: ['shots', index, 'ordinal'],
        message: 'Shot ordinals must follow the saved order.',
      });
    if (
      shot.speakerId &&
      !plan.cast.some((member) => member.id === shot.speakerId)
    )
      ctx.addIssue({
        code: 'custom',
        path: ['shots', index, 'speakerId'],
        message: 'Choose a member of the storyboard cast.',
      });
    if (shot.stillFreshness === 'fresh' && !shot.stillAssetId)
      ctx.addIssue({
        code: 'custom',
        path: ['shots', index, 'stillAssetId'],
        message: 'A fresh still requires an asset.',
      });
    validateStoryboardShotCuts(shot, index, ctx);
    if (
      shot.referenceRoles &&
      new Set(shot.referenceRoles.map((reference) => reference.assetId))
        .size !== shot.referenceRoles.length
    )
      ctx.addIssue({
        code: 'custom',
        path: ['shots', index, 'referenceRoles'],
        message: 'Give each reference image one role.',
      });
    if (shot.transition === 'interpolate' && index === plan.shots.length - 1)
      ctx.addIssue({
        code: 'custom',
        path: ['shots', index, 'transition'],
        message: 'The final shot cannot interpolate.',
      });
  });
}
export const storyboardPlanSchema = storyboardPlanDraftSchema.superRefine(
  validateStoryboardPlan,
);
export const updateStoryboardPlanSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    plan: storyboardPlanSchema,
    capabilityVersion: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type StoryboardPlanSettings = z.infer<
  typeof storyboardPlanSettingsSchema
>;
export type StoryboardPlan = z.infer<typeof storyboardPlanSchema>;
export type StoryboardPlanKind = z.infer<typeof storyboardPlanKindSchema>;
export type StoryboardShot = z.infer<typeof storyboardShotSchema>;
export type StoryboardShotCut = z.infer<typeof storyboardShotCutSchema>;
export type StoryboardReferenceRole = z.infer<
  typeof storyboardReferenceRoleSchema
>;
export type StoryboardShotReferenceRole = z.infer<
  typeof storyboardShotReferenceRoleSchema
>;
export type StoryboardCastMember = z.infer<typeof storyboardCastMemberSchema>;
export type StoryboardCutaway = z.infer<typeof storyboardCutawaySchema>;
export type StoryboardSegment = z.infer<typeof storyboardSegmentSchema>;
export type StoryboardLongForm = z.infer<typeof storyboardLongFormSchema>;
export type UpdateStoryboardPlan = z.infer<typeof updateStoryboardPlanSchema>;
