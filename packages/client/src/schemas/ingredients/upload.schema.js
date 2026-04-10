import {
  ACCEPTED_AUDIO_TYPES,
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  MAX_FILE_SIZE,
} from '@genfeedai/constants';
import { z } from 'zod';

const fileSizeSchema = z
  .instanceof(File)
  .refine(
    (file) => file.size <= MAX_FILE_SIZE,
    'File size must be less than 100MB',
  );
export const uploadSchema = z.object({
  category: z.enum(['images', 'videos', 'musics', 'avatars', 'fonts']),
  description: z.string().optional(),
  file: fileSizeSchema,
  label: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export const imageUploadSchema = uploadSchema.extend({
  file: fileSizeSchema.refine(
    (file) => ACCEPTED_IMAGE_TYPES.includes(file.type),
    'File must be a valid image format (JPEG, PNG, GIF, WebP)',
  ),
});
export const videoUploadSchema = uploadSchema.extend({
  file: fileSizeSchema.refine(
    (file) => ACCEPTED_VIDEO_TYPES.includes(file.type),
    'File must be a valid video format (MP4, WebM, OGG)',
  ),
});
export const audioUploadSchema = uploadSchema.extend({
  file: fileSizeSchema.refine(
    (file) => ACCEPTED_AUDIO_TYPES.includes(file.type),
    'File must be a valid audio format (MP3, WAV, OGG)',
  ),
});
//# sourceMappingURL=upload.schema.js.map
