import { z } from 'zod';
import {
  brandRemixSourceSelectorSchema,
  brandRemixSourceSnapshotSchema,
} from './brand-remix-run.contract';

export const storyboardIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/);
export const storyboardBriefSourceSchema = z
  .object({
    kind: z.literal('brief'),
    brief: z.string().trim().max(2_000),
    seedImageAssetId: storyboardIdSchema.optional(),
  })
  .strict()
  .refine(
    (source) => source.brief.length > 0 || Boolean(source.seedImageAssetId),
    'An empty brief requires a seed image.',
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
