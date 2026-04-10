import { z } from 'zod';
export declare const uploadSchema: z.ZodObject<
  {
    category: z.ZodEnum<{
      images: 'images';
      videos: 'videos';
      musics: 'musics';
      avatars: 'avatars';
      fonts: 'fonts';
    }>;
    description: z.ZodOptional<z.ZodString>;
    file: z.ZodCustom<File, File>;
    label: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
  },
  z.core.$strip
>;
export declare const imageUploadSchema: z.ZodObject<
  {
    category: z.ZodEnum<{
      images: 'images';
      videos: 'videos';
      musics: 'musics';
      avatars: 'avatars';
      fonts: 'fonts';
    }>;
    description: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    file: z.ZodCustom<File, File>;
  },
  z.core.$strip
>;
export declare const videoUploadSchema: z.ZodObject<
  {
    category: z.ZodEnum<{
      images: 'images';
      videos: 'videos';
      musics: 'musics';
      avatars: 'avatars';
      fonts: 'fonts';
    }>;
    description: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    file: z.ZodCustom<File, File>;
  },
  z.core.$strip
>;
export declare const audioUploadSchema: z.ZodObject<
  {
    category: z.ZodEnum<{
      images: 'images';
      videos: 'videos';
      musics: 'musics';
      avatars: 'avatars';
      fonts: 'fonts';
    }>;
    description: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    file: z.ZodCustom<File, File>;
  },
  z.core.$strip
>;
export type UploadSchema = z.infer<typeof uploadSchema>;
export type ImageUploadSchema = z.infer<typeof imageUploadSchema>;
export type VideoUploadSchema = z.infer<typeof videoUploadSchema>;
export type AudioUploadSchema = z.infer<typeof audioUploadSchema>;
//# sourceMappingURL=upload.schema.d.ts.map
