import { ModelCategory } from '@genfeedai/enums';
import { z } from 'zod';
// Base element schema with common fields
export const elementBaseSchema = z.object({
  description: z.string().optional(),
  key: z
    .string()
    .min(1, 'Key is required')
    .regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens'),
  label: z.string().min(1, 'Label is required'),
});
// Schema for preset elements (collection of elements)
export const elementPresetSchema = elementBaseSchema.extend({
  brand: z.string().optional(),
  category: z.enum(Object.values(ModelCategory)),
  isActive: z.boolean(),
  organization: z.string().optional(),
});
// Schema for style elements
export const elementStyleSchema = elementBaseSchema.extend({
  model: z.string().optional(),
  models: z
    .array(z.string())
    .min(1, 'At least one model is required')
    .optional(),
});
// Schema for simple elements (mood, camera, font-family, lens, lighting, camera-movement)
export const elementSimpleSchema = elementBaseSchema;
// Schema for blacklist elements
export const elementBlacklistSchema = elementBaseSchema.extend({
  category: z.nativeEnum(ModelCategory).optional(),
  isActive: z.boolean(),
  isDefault: z.boolean(),
});
// Schema for sound elements
export const elementSoundSchema = elementBaseSchema.extend({
  isActive: z.boolean().optional(),
});
// Factory function to get the appropriate schema based on element type
export function getElementSchema(type) {
  switch (type) {
    case 'preset':
      return elementPresetSchema;
    case 'style':
      return elementStyleSchema;
    case 'blacklist':
      return elementBlacklistSchema;
    case 'sound':
      return elementSoundSchema;
    case 'mood':
    case 'camera':
    case 'font-family':
    case 'lens':
    case 'lighting':
    case 'camera-movement':
      return elementSimpleSchema;
    default:
      return elementBaseSchema;
  }
}
// External alias exports.
export {
  elementBlacklistSchema as blacklistElementSchema,
  elementPresetSchema as presetElementSchema,
  elementSimpleSchema as simpleElementSchema,
  elementSoundSchema as soundElementSchema,
  elementStyleSchema as styleElementSchema,
};
//# sourceMappingURL=element.schema.js.map
