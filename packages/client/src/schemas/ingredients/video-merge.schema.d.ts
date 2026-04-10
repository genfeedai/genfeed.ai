import { IngredientFormat } from '@genfeedai/enums';
import { z } from 'zod';
export declare const videoMergeSchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodString>;
    format: z.ZodEnum<{
      landscape: IngredientFormat.LANDSCAPE;
      portrait: IngredientFormat.PORTRAIT;
      square: IngredientFormat.SQUARE;
    }>;
    frames: z.ZodArray<
      z.ZodObject<
        {
          id: z.ZodString;
          title: z.ZodOptional<z.ZodString>;
          url: z.ZodString;
        },
        z.core.$strip
      >
    >;
    height: z.ZodNumber;
    isCaptionsEnabled: z.ZodBoolean;
    label: z.ZodString;
    music: z.ZodOptional<z.ZodString>;
    width: z.ZodNumber;
  },
  z.core.$strip
>;
export type VideoMergeSchema = z.infer<typeof videoMergeSchema>;
export declare function convertToFormData(
  videos: Array<{
    id: string;
    url: string;
    thumbnailUrl?: string;
    title?: string;
  }>,
  options?: {
    label?: string;
    isCaptionsEnabled?: boolean;
    format?: IngredientFormat;
    music?: string;
  },
): VideoMergeSchema;
//# sourceMappingURL=video-merge.schema.d.ts.map
