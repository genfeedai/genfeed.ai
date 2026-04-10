import { PostStatus } from '@genfeedai/enums';
import { z } from 'zod';
export declare const postSchema: z.ZodObject<
  {
    credential: z.ZodOptional<z.ZodString>;
    description: z.ZodString;
    isRepeat: z.ZodOptional<z.ZodBoolean>;
    label: z.ZodString;
    scheduledDate: z.ZodString;
    status: z.ZodOptional<
      z.ZodEnum<{
        public: PostStatus.PUBLIC;
        private: PostStatus.PRIVATE;
        unlisted: PostStatus.UNLISTED;
      }>
    >;
  },
  z.core.$strip
>;
export type PostSchema = z.infer<typeof postSchema>;
export declare const multiPostSchema: z.ZodObject<
  {
    globalDescription: z.ZodOptional<z.ZodString>;
    globalLabel: z.ZodOptional<z.ZodString>;
    platforms: z.ZodArray<
      z.ZodObject<
        {
          credentialId: z.ZodString;
          customScheduledDate: z.ZodOptional<z.ZodString>;
          description: z.ZodString;
          enabled: z.ZodBoolean;
          handle: z.ZodString;
          label: z.ZodString;
          overrideSchedule: z.ZodBoolean;
          platform: z.ZodString;
          status: z.ZodString;
        },
        z.core.$strip
      >
    >;
    scheduledDate: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    youtubeStatus: z.ZodEnum<{
      public: PostStatus.PUBLIC;
      private: PostStatus.PRIVATE;
      unlisted: PostStatus.UNLISTED;
    }>;
  },
  z.core.$strip
>;
export type MultiPostSchema = z.infer<typeof multiPostSchema>;
export declare const postModalSchema: z.ZodObject<
  {
    children: z.ZodOptional<z.ZodArray<z.ZodString>>;
    credential: z.ZodString;
    description: z.ZodString;
    ingredients: z.ZodOptional<z.ZodArray<z.ZodString>>;
    label: z.ZodOptional<z.ZodString>;
    parent: z.ZodOptional<z.ZodString>;
    scheduledDate: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type PostModalSchema = z.infer<typeof postModalSchema>;
export declare const postMetadataSchema: z.ZodObject<
  {
    description: z.ZodString;
    label: z.ZodString;
    scheduledDate: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type PostMetadataSchema = z.infer<typeof postMetadataSchema>;
export declare const threadPostSchema: z.ZodObject<
  {
    description: z.ZodString;
  },
  z.core.$strip
>;
export type ThreadPostSchema = z.infer<typeof threadPostSchema>;
export declare const threadModalSchema: z.ZodObject<
  {
    credential: z.ZodString;
    globalTitle: z.ZodOptional<z.ZodString>;
    ingredient: z.ZodString;
    posts: z.ZodArray<
      z.ZodObject<
        {
          description: z.ZodString;
        },
        z.core.$strip
      >
    >;
    scheduledDate: z.ZodString;
    status: z.ZodOptional<z.ZodString>;
  },
  z.core.$strip
>;
export type ThreadModalSchema = z.infer<typeof threadModalSchema>;
//# sourceMappingURL=post.schema.d.ts.map
