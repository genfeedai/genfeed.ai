import { z } from 'zod';
export declare const upscaleSchema: z.ZodObject<
  {
    format: z.ZodString;
    height: z.ZodNumber;
    model: z.ZodOptional<z.ZodString>;
    targetFps: z.ZodOptional<z.ZodNumber>;
    targetResolution: z.ZodOptional<
      z.ZodEnum<{
        '720p': '720p';
        '1080p': '1080p';
        '4k': '4k';
      }>
    >;
    width: z.ZodNumber;
  },
  z.core.$strip
>;
export type UpscaleSchema = z.infer<typeof upscaleSchema>;
//# sourceMappingURL=upscale.schema.d.ts.map
