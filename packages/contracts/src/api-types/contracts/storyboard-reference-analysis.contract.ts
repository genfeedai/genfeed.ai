import { z } from 'zod';
import {
  STORYBOARD_SHOT_LIMITS,
  storyboardReferenceRoleSchema,
} from './storyboard-plan.contract';
import { storyboardIdSchema } from './storyboard-source.contract';

/**
 * Reverse engineering of a reference video or image (#10578): the model reads
 * the sampled frames, the stored on-screen text and the transcript, and answers
 * in the fields the Storyboard plan already accepts (`cuts`, `sfx`,
 * `videoPrompt`), plus the look and the timed on-screen text the plan has no
 * field for. There is no second plan model: the answer is mapped into plan
 * shots, and the person edits them in the plan.
 *
 * Every property is required and optional values are nullable, which strict
 * structured outputs demand.
 */
export const REFERENCE_ANALYSIS_LIMITS = {
  maxOverlaysPerShot: 6,
  maxPalette: 8,
  maxReferenceRolesPerShot: 6,
  /** Longest reference video the analysis reads, as for scene analysis (#5455). */
  maxVideoSeconds: 60,
  /** Largest reference video the analysis reads, as for scene analysis (#5455). */
  maxVideoBytes: 104_857_600,
} as const;

/** Reverse a Library video or image into the shots of a storyboard. */
export const reverseStoryboardPlanSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    /** The Library video (up to 60 s) or image to reverse engineer. */
    assetId: storyboardIdSchema,
  })
  .strict();

export const referenceStyleSchema = z
  .object({
    /** A short name for the look, used as the plan's style label. */
    label: z.string().trim().min(1).max(60),
    palette: z
      .array(z.string().trim().min(1).max(40))
      .max(REFERENCE_ANALYSIS_LIMITS.maxPalette),
    lighting: z.string().trim().max(200),
    lens: z.string().trim().max(200),
    grade: z.string().trim().max(200),
    /** Letterforms of the on-screen text; empty when there is none. */
    typography: z.string().trim().max(200),
  })
  .strict();

/** Text on screen, with when it shows (null for a still image) and how it arrives. */
export const referenceOverlaySchema = z
  .object({
    text: z.string().trim().min(1).max(200),
    startSeconds: z.number().min(0).max(60).nullable(),
    endSeconds: z.number().positive().max(60).nullable(),
    position: z.string().trim().max(60),
    arrival: z.string().trim().max(60),
  })
  .strict();

/** A picture the shot needs and what it is to the video model. */
export const referenceNeedSchema = z
  .object({
    role: storyboardReferenceRoleSchema,
    label: z.string().trim().min(1).max(60),
  })
  .strict();

export const referenceVideoShotSchema = z
  .object({
    sectionLabel: z.string().trim().min(1).max(40),
    /** Where the shot sits in the source, to the tenth of a second. */
    startSeconds: z.number().min(0).max(60),
    endSeconds: z.number().positive().max(60),
    /** What the viewer sees, in present tense. */
    action: z.string().trim().min(1).max(1_000),
    /** Cuts inside the shot, in seconds from the start of the shot. */
    cuts: z
      .array(
        z
          .object({
            startSeconds: z.number().min(0).max(60),
            endSeconds: z.number().positive().max(60),
            framing: z.string().trim().min(1).max(200),
            camera: z.string().trim().max(200).nullable(),
          })
          .strict(),
      )
      .max(STORYBOARD_SHOT_LIMITS.maxCuts),
    sfx: z
      .array(z.string().trim().min(1).max(200))
      .max(STORYBOARD_SHOT_LIMITS.maxSfx),
    referenceRoles: z
      .array(referenceNeedSchema)
      .max(REFERENCE_ANALYSIS_LIMITS.maxReferenceRolesPerShot),
    overlays: z
      .array(referenceOverlaySchema)
      .max(REFERENCE_ANALYSIS_LIMITS.maxOverlaysPerShot),
    /** One self-contained prompt for this shot alone; no on-screen text. */
    videoPrompt: z.string().trim().min(1).max(1_500),
  })
  .strict();

export const referenceVideoAnalysisSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    logline: z.string().trim().max(300),
    style: referenceStyleSchema,
    shots: z.array(referenceVideoShotSchema).min(2).max(12),
  })
  .strict();

export const referenceImageAnalysisSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    style: referenceStyleSchema,
    /** Where the subject sits and how the frame is built. */
    composition: z.string().trim().min(1).max(500),
    referenceRoles: z
      .array(referenceNeedSchema)
      .max(REFERENCE_ANALYSIS_LIMITS.maxReferenceRolesPerShot),
    overlays: z
      .array(referenceOverlaySchema)
      .max(REFERENCE_ANALYSIS_LIMITS.maxOverlaysPerShot),
    /** One prompt that recreates the picture with a new subject. */
    prompt: z.string().trim().min(1).max(1_500),
  })
  .strict();

export type ReverseStoryboardPlan = z.infer<typeof reverseStoryboardPlanSchema>;
export type ReferenceStyle = z.infer<typeof referenceStyleSchema>;
export type ReferenceOverlay = z.infer<typeof referenceOverlaySchema>;
export type ReferenceNeed = z.infer<typeof referenceNeedSchema>;
export type ReferenceVideoShot = z.infer<typeof referenceVideoShotSchema>;
export type ReferenceVideoAnalysis = z.infer<
  typeof referenceVideoAnalysisSchema
>;
export type ReferenceImageAnalysis = z.infer<
  typeof referenceImageAnalysisSchema
>;
