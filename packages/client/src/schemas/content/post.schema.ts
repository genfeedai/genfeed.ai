import {
  PostFormat,
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { z } from 'zod';

// Reusable post status enum for YouTube-compatible platforms
const postStatusEnum = z.enum([
  PostStatus.PUBLIC,
  PostStatus.PRIVATE,
  PostStatus.UNLISTED,
]);

// Platform item schema for multi-post
const platformItemSchema = z.object({
  credentialId: z.string(),
  customScheduledDate: z.string().optional(),
  description: z.string(),
  enabled: z.boolean(),
  handle: z.string(),
  label: z.string(),
  overrideSchedule: z.boolean(),
  platform: z.string(),
  targetExecutionState: z.nativeEnum(TargetExecutionState),
  visibility: z.nativeEnum(PostVisibility),
});

const publishAttributionSchema = {
  contentRunId: z.string().optional(),
  creativeVersion: z.string().optional(),
  hookVersion: z.string().optional(),
  personaId: z.string().optional(),
  publishIntent: z.string().optional(),
  scheduleSlot: z.string().optional(),
  variantId: z.string().optional(),
};

export const postSchema = z.object({
  credentialId: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  isRepeat: z.boolean().optional(),
  label: z.string().min(1, 'Label is required'),
  scheduledDate: z.string().min(1, 'Schedule date is required'),
  status: postStatusEnum.optional(),
  targetExecutionState: z.nativeEnum(TargetExecutionState).optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
  ...publishAttributionSchema,
});

export type PostSchema = z.infer<typeof postSchema>;

export const multiPostSchema = z.object({
  globalDescription: z.string().optional(),
  globalLabel: z.string().optional(),
  platforms: z.array(platformItemSchema),
  scheduledDate: z.string().nullable().optional(),
  youtubeStatus: postStatusEnum.optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
});

export type MultiPostSchema = z.infer<typeof multiPostSchema>;

export const postModalSchema = z
  .object({
    children: z.array(z.string()).optional(),
    credentialId: z.string().min(1, 'Platform account is required'),
    description: z.string().min(1, 'Caption is required'),
    format: z.nativeEnum(PostFormat).optional(),
    ingredients: z.array(z.string()).optional(),
    label: z.string().optional(),
    parentId: z.string().optional(),
    scheduledDate: z.string().optional(),
    status: z.string().optional(),
    targetExecutionState: z.nativeEnum(TargetExecutionState).optional(),
    visibility: z.nativeEnum(PostVisibility).optional(),
    ...publishAttributionSchema,
  })
  .superRefine((value, context) => {
    // Lifecycle now lives on targetExecutionState; `status` is the legacy
    // audience-ish column and no longer gates scheduling.
    if (
      value.targetExecutionState === TargetExecutionState.SCHEDULED &&
      !value.scheduledDate?.trim()
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Scheduled date is required',
        path: ['scheduledDate'],
      });
    }

    if (
      value.format === PostFormat.LONG_FORM &&
      value.description.length > 25_000
    ) {
      context.addIssue({
        code: 'custom',
        message: 'X long posts must be 25,000 characters or fewer',
        path: ['description'],
      });
    }
  });

export type PostModalSchema = z.infer<typeof postModalSchema>;

export const postMetadataSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  label: z.string().min(1, 'Title is required'),
  scheduledDate: z.string().min(1, 'Scheduled date is required'),
  status: z.string().optional(),
  targetExecutionState: z.nativeEnum(TargetExecutionState).optional(),
  visibility: z.nativeEnum(PostVisibility).optional(),
  ...publishAttributionSchema,
});

export type PostMetadataSchema = z.infer<typeof postMetadataSchema>;

export const threadPostSchema = z.object({
  description: z.string().min(1, 'Post content is required'),
});

export type ThreadPostSchema = z.infer<typeof threadPostSchema>;

export const threadModalSchema = z
  .object({
    credentialId: z.string().min(1, 'Platform account is required'),
    globalTitle: z.string().optional(),
    ingredient: z.string().optional(),
    posts: z.array(threadPostSchema).min(1, 'At least one post is required'),
    scheduledDate: z.string().optional(),
    status: z.string().optional(),
    targetExecutionState: z.nativeEnum(TargetExecutionState).optional(),
    visibility: z.nativeEnum(PostVisibility).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.targetExecutionState === TargetExecutionState.SCHEDULED &&
      !value.scheduledDate?.trim()
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Scheduled date is required',
        path: ['scheduledDate'],
      });
    }
  });

export type ThreadModalSchema = z.infer<typeof threadModalSchema>;
