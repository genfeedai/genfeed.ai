import { MODEL_KEYS } from '@genfeedai/constants';
import { IngredientFormat } from '@genfeedai/enums';
import { z } from 'zod';

const UPSCALE_MODELS = [
  MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
  MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
];
function isUpscaleModel(model) {
  return UPSCALE_MODELS.includes(model);
}
export const editFormSchema = z
  .object({
    enhanceModel: z
      .enum([
        'Standard V2',
        'Low Resolution V2',
        'CGI',
        'High Fidelity V2',
        'Text Refine',
      ])
      .optional(),
    faceEnhancement: z.boolean().optional(),
    faceEnhancementCreativity: z.number().min(0).max(1).optional(),
    faceEnhancementStrength: z.number().min(0).max(1).optional(),
    format: z
      .enum([
        IngredientFormat.LANDSCAPE,
        IngredientFormat.PORTRAIT,
        IngredientFormat.SQUARE,
      ])
      .optional(),
    fps: z
      .union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)])
      .optional(),
    height: z.number().optional(),
    model: z.string().min(1, 'Model is required'),
    outputFormat: z.enum(['jpg', 'png']).optional(),
    resolution: z.enum(['720p', '1080p', '4k']).optional(),
    subjectDetection: z
      .enum(['None', 'All', 'Foreground', 'Background'])
      .optional(),
    text: z.string(),
    upscaleFactor: z.enum(['2x', '4x', '6x']).optional(),
    width: z.number().optional(),
  })
  .refine((data) => isUpscaleModel(data.model) || data.text.trim().length > 0, {
    message: 'Text description is required for this model',
    path: ['text'],
  });
//# sourceMappingURL=edit.schema.js.map
