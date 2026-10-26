import { z } from 'zod';
import { GENERATION_PROMPT_AUTHORS } from '../../interfaces/content/generation-harness.interface';
import {
  brandRemixSourceSelectorSchema,
  brandRemixSourceSnapshotSchema,
} from './brand-remix-run.contract';

export const STORYBOARD_SHORT_BRIEF_MAX_CHARACTERS = 2_000;
export const STORYBOARD_LONG_BRIEF_MAX_CHARACTERS = 20_000;
export const storyboardIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/);
export const storyboardBriefSourceSchema = z
  .object({
    kind: z.literal('brief'),
    /** Long-form briefs (a voice-note transcript) may run to 20,000 characters. */
    brief: z.string().trim().max(STORYBOARD_LONG_BRIEF_MAX_CHARACTERS),
    length: z.enum(['short', 'long_form']).optional(),
    seedImageAssetId: storyboardIdSchema.optional(),
    /** Set when the brief started as an agent draft (#7341); absent means the member wrote it. */
    author: z.enum(GENERATION_PROMPT_AUTHORS).optional(),
  })
  .strict()
  .refine(
    (source) => source.brief.length > 0 || Boolean(source.seedImageAssetId),
    'An empty brief requires a seed image.',
  )
  .refine(
    (source) =>
      source.length === 'long_form' ||
      source.brief.length <= STORYBOARD_SHORT_BRIEF_MAX_CHARACTERS,
    {
      message: `A short storyboard brief is at most ${STORYBOARD_SHORT_BRIEF_MAX_CHARACTERS} characters.`,
      path: ['brief'],
    },
  );
export const storyboardUploadedVideoSourceSchema = z
  .object({
    kind: z.literal('uploaded_video'),
    assetId: storyboardIdSchema,
  })
  .strict();
export const storyboardSourceSelectorSchema = z.union([
  storyboardBriefSourceSchema,
  storyboardUploadedVideoSourceSchema,
  brandRemixSourceSelectorSchema,
]);
export const storyboardSourceSnapshotSchema = z.union([
  z
    .object({
      selector: storyboardBriefSourceSchema,
      capturedAt: z.string().datetime(),
    })
    .strict(),
  z
    .object({
      selector: storyboardUploadedVideoSourceSchema,
      capturedAt: z.string().datetime(),
      assetId: storyboardIdSchema,
      assetUpdatedAt: z.string().datetime(),
      title: z.string().max(1_000),
      durationSeconds: z.number().finite().positive().max(60),
      sizeBytes: z.number().finite().positive().max(104_857_600),
    })
    .strict()
    .refine(
      (value) => value.assetId === value.selector.assetId,
      'Source asset must match selector',
    ),
  brandRemixSourceSnapshotSchema,
]);
export type StoryboardSourceSelector = z.infer<
  typeof storyboardSourceSelectorSchema
>;
export type StoryboardSourceSnapshot = z.infer<
  typeof storyboardSourceSnapshotSchema
>;
