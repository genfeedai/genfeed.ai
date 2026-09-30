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
  })
  .strict();
export const storyboardPlanSettingsSchema = z
  .object({
    videoModelKey: storyboardModelKeySchema
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    format: z.enum(['9:16', '16:9', '1:1']),
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
  })
  .strict();
export const storyboardPlanSchema = storyboardPlanDraftSchema.superRefine(
  (plan, ctx) => {
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
      if (shot.transition === 'interpolate' && index === plan.shots.length - 1)
        ctx.addIssue({
          code: 'custom',
          path: ['shots', index, 'transition'],
          message: 'The final shot cannot interpolate.',
        });
    });
  },
);
export const updateStoryboardPlanSchema = z
  .object({
    expectedRevision: z.number().int().positive(),
    plan: storyboardPlanDraftSchema,
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
export type StoryboardShot = z.infer<typeof storyboardShotSchema>;
export type StoryboardCastMember = z.infer<typeof storyboardCastMemberSchema>;
export type UpdateStoryboardPlan = z.infer<typeof updateStoryboardPlanSchema>;
