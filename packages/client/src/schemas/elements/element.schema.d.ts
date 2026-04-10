import type {
  IElementBlacklist,
  IElementMood,
  IElementStyle,
  IPreset,
  ISound,
} from '@genfeedai/interfaces';
import { z } from 'zod';
export declare const elementBaseSchema: z.ZodObject<
  {
    description: z.ZodOptional<z.ZodString>;
    key: z.ZodString;
    label: z.ZodString;
  },
  z.core.$strip
>;
export declare const elementPresetSchema: z.ZodType<Partial<IPreset>>;
export declare const elementStyleSchema: z.ZodType<Partial<IElementStyle>>;
export declare const elementSimpleSchema: z.ZodType<Partial<IElementMood>>;
export declare const elementBlacklistSchema: z.ZodType<
  Partial<IElementBlacklist>
>;
export declare const elementSoundSchema: z.ZodType<Partial<ISound>>;
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
export declare function getElementSchema(type: ElementType): z.ZodTypeAny;
export type ElementBaseSchema = z.infer<typeof elementBaseSchema>;
export type ElementPresetSchema = z.infer<typeof elementPresetSchema>;
export type ElementStyleSchema = z.infer<typeof elementStyleSchema>;
export type ElementSimpleSchema = z.infer<typeof elementSimpleSchema>;
export type ElementBlacklistSchema = z.infer<typeof elementBlacklistSchema>;
export type ElementSoundSchema = z.infer<typeof elementSoundSchema>;
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
export {
  elementBlacklistSchema as blacklistElementSchema,
  elementPresetSchema as presetElementSchema,
  elementSimpleSchema as simpleElementSchema,
  elementSoundSchema as soundElementSchema,
  elementStyleSchema as styleElementSchema,
};
//# sourceMappingURL=element.schema.d.ts.map
