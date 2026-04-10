import { z } from 'zod';
export const upscaleSchema = z.object({
  format: z.string().min(1, 'Format is required'),
  height: z
    .number()
    .min(64, 'Height must be at least 64')
    .max(4096, 'Height must be at most 4096'),
  model: z.string().optional(),
  targetFps: z.number().min(1).max(120).optional(),
  targetResolution: z.enum(['720p', '1080p', '4k']).optional(),
  width: z
    .number()
    .min(64, 'Width must be at least 64')
    .max(4096, 'Width must be at most 4096'),
});
//# sourceMappingURL=upscale.schema.js.map
