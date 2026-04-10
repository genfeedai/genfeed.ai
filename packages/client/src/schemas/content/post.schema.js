import { PostStatus } from '@genfeedai/enums';
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
  status: z.string(),
});
export const postSchema = z.object({
  credential: z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  isRepeat: z.boolean().optional(),
  label: z.string().min(1, 'Label is required'),
  scheduledDate: z.string().min(1, 'Schedule date is required'),
  status: postStatusEnum.optional(),
});
export const multiPostSchema = z.object({
  globalDescription: z.string().optional(),
  globalLabel: z.string().optional(),
  platforms: z.array(platformItemSchema),
  scheduledDate: z.string().nullable().optional(),
  youtubeStatus: postStatusEnum,
});
export const postModalSchema = z.object({
  children: z.array(z.string()).optional(),
  credential: z.string().min(1, 'Platform account is required'),
  description: z.string().min(1, 'Caption is required'),
  ingredients: z.array(z.string()).optional(),
  label: z.string().optional(),
  parent: z.string().optional(),
  scheduledDate: z.string().optional(),
  status: z.string().optional(),
});
export const postMetadataSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  label: z.string().min(1, 'Title is required'),
  scheduledDate: z.string().min(1, 'Scheduled date is required'),
  status: z.string().optional(),
});
export const threadPostSchema = z.object({
  description: z.string().min(1, 'Post content is required'),
});
export const threadModalSchema = z.object({
  credential: z.string().min(1, 'Platform account is required'),
  globalTitle: z.string().optional(),
  ingredient: z.string().min(1, 'Content is required'),
  posts: z.array(threadPostSchema).min(1, 'At least one post is required'),
  scheduledDate: z.string().min(1, 'Scheduled date is required'),
  status: z.string().optional(),
});
//# sourceMappingURL=post.schema.js.map
