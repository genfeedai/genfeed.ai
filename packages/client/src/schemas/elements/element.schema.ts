import { ModelCategory } from '@genfeedai/contracts';
import type {
  IElementBlacklist,
  IElementMood,
  IElementStyle,
  IPlatformElement,
  IPreset,
} from '@genfeedai/contracts/interfaces';
import { z } from 'zod';

// Base element schema with common fields
export const elementBaseSchema = z.object({
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  key: z
    .string()
    .min(1, 'Key is required')
    .regex(/^[a-z0-9-]+$/, 'Must be lowercase alphanumeric with hyphens'),
  label: z.string().min(1, 'Label is required'),
  sortOrder: z.number().int().min(0).optional(),
});

// Schema for preset elements (collection of elements)
export const elementPresetSchema: z.ZodType<Partial<IPreset>> =
  elementBaseSchema.extend({
    brandId: z.string().optional(),
    category: z.enum(
      Object.values(ModelCategory) as [ModelCategory, ...ModelCategory[]],
    ),
    isActive: z.boolean(),
    organizationId: z.string().optional(),
    prompt: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    model: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    aspectRatio: z
      .string()
      .regex(/^(?:[1-9]\d*)(?:\.\d+)?:[1-9]\d*(?:\.\d+)?$/)
      .or(z.literal(''))
      .nullish()
      .transform((value) => value ?? undefined),
    duration: z
      .number()
      .min(0.01)
      .max(3600)
      .nullish()
      .transform((value) => value ?? undefined),
    promptTemplate: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    camera: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    cameraMovement: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    lighting: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    lens: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    mood: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    scene: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    style: z
      .string()
      .nullish()
      .transform((value) => value ?? undefined),
    blacklists: z
      .array(z.string())
      .nullish()
      .transform((value) => value ?? undefined),
  });

// Schema for style elements
export const elementStyleSchema: z.ZodType<Partial<IElementStyle>> =
  elementBaseSchema.extend({
    model: z.string().optional(),
    models: z
      .array(z.string())
      .min(1, 'At least one model is required')
      .optional(),
  });

// Schema for simple elements (mood, camera, font-family, lens, lighting, camera-movement)
export const elementSimpleSchema: z.ZodType<Partial<IElementMood>> =
  elementBaseSchema;

// Schema for blacklist elements
export const elementBlacklistSchema: z.ZodType<Partial<IElementBlacklist>> =
  elementBaseSchema.extend({
    category: z.nativeEnum(ModelCategory).optional(),
    isActive: z.boolean(),
    isDefault: z.boolean(),
  });

// Schema for sound elements
export const elementSoundSchema: z.ZodType<Partial<IPlatformElement>> =
  elementBaseSchema.extend({
    isActive: z.boolean().optional(),
  });

// Element type for getElementSchema
type ElementType =
  | 'preset'
  | 'style'
  | 'mood'
  | 'camera'
  | 'font-family'
  | 'blacklist'
  | 'sound'
  | 'lens'
  | 'lighting'
  | 'camera-movement';

// Factory function to get the appropriate schema based on element type
export function getElementSchema(type: ElementType): z.ZodTypeAny {
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

// Type exports
export type ElementBaseSchema = z.infer<typeof elementBaseSchema>;
export type ElementPresetSchema = z.infer<typeof elementPresetSchema>;
export type ElementStyleSchema = z.infer<typeof elementStyleSchema>;
export type ElementSimpleSchema = z.infer<typeof elementSimpleSchema>;
export type ElementBlacklistSchema = z.infer<typeof elementBlacklistSchema>;
export type ElementSoundSchema = z.infer<typeof elementSoundSchema>;

// Union type for all element schemas
export type ElementSchema =
  | ElementPresetSchema
  | ElementStyleSchema
  | ElementSimpleSchema
  | ElementBlacklistSchema
  | ElementSoundSchema;

export type {
  ElementBlacklistSchema as BlacklistElementSchema,
  ElementPresetSchema as PresetElementSchema,
  ElementSimpleSchema as SimpleElementSchema,
  ElementSoundSchema as SoundElementSchema,
  ElementStyleSchema as StyleElementSchema,
};
// External alias exports.
export {
  elementBlacklistSchema as blacklistElementSchema,
  elementPresetSchema as presetElementSchema,
  elementSimpleSchema as simpleElementSchema,
  elementSoundSchema as soundElementSchema,
  elementStyleSchema as styleElementSchema,
};
