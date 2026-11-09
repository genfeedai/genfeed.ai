import { z } from 'zod';
import { FontFamily } from '../../enums/font.enum';

/**
 * Brand kit palette and font roles (#9708, #9709). Both are Brand OS fields:
 * an owner edits them in a draft and approving the draft writes them to the
 * brand. They extend primary, secondary and background, which prompts and
 * templates keep reading as before.
 */

/**
 * Generation rules hold at most 32 palette entries and three of them are
 * primary, secondary and background.
 */
export const BRAND_PALETTE_MAX_COLORS = 29;
export const BRAND_PALETTE_NAME_MAX = 64;
export const BRAND_PALETTE_USAGE_MAX = 200;
export const BRAND_FONT_FAMILY_NAME_MAX = 128;

export const BRAND_FONT_ROLES = ['heading', 'body', 'caption'] as const;
export type BrandFontRole = (typeof BRAND_FONT_ROLES)[number];

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export const brandPaletteColorSchema = z.strictObject({
  name: z.string().trim().min(1).max(BRAND_PALETTE_NAME_MAX),
  hex: z
    .string()
    .regex(HEX_COLOR_PATTERN)
    .transform((value) => value.toUpperCase()),
  usage: z.string().trim().max(BRAND_PALETTE_USAGE_MAX).optional(),
});

export const brandPaletteSchema = z
  .array(brandPaletteColorSchema)
  .max(BRAND_PALETTE_MAX_COLORS)
  .refine(
    (colors) =>
      new Set(colors.map((color) => color.name.toLowerCase())).size ===
      colors.length,
    'Palette color names must be unique',
  );

const presetFontSchema = z.strictObject({
  source: z.literal('preset'),
  fontFamily: z.enum(FontFamily),
});

const uploadedFontSchema = z.strictObject({
  source: z.literal('upload'),
  assetId: z.string().min(1).max(256),
  contentHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  family: z.string().trim().min(1).max(BRAND_FONT_FAMILY_NAME_MAX),
  weight: z.number().int().min(100).max(900).multipleOf(100),
  style: z.enum(['normal', 'italic']),
});

export const brandFontRoleAssignmentSchema = z.discriminatedUnion('source', [
  presetFontSchema,
  uploadedFontSchema,
]);

export const brandFontRolesSchema = z.strictObject({
  heading: brandFontRoleAssignmentSchema.optional(),
  body: brandFontRoleAssignmentSchema.optional(),
  caption: brandFontRoleAssignmentSchema.optional(),
});

export type BrandPaletteColor = z.infer<typeof brandPaletteColorSchema>;
export type BrandFontRoleAssignment = z.infer<
  typeof brandFontRoleAssignmentSchema
>;
export type BrandFontRoles = z.infer<typeof brandFontRolesSchema>;

/** The saved palette, or an empty one when the stored value is not a palette. */
export function readBrandPalette(value: unknown): BrandPaletteColor[] {
  const parsed = brandPaletteSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

/** The saved font roles, or none when the stored value is not valid. */
export function readBrandFontRoles(value: unknown): BrandFontRoles {
  const parsed = brandFontRolesSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}
