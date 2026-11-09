import { z } from 'zod';
import { isBrandKitSlotForCategory } from '../../constants/brand-kit-slots.constant';
import { AssetCategory, BrandKitSlot } from '../../enums/asset.enum';
import { FontFamily } from '../../enums/font.enum';
import {
  BRAND_FONT_FAMILY_NAME_MAX,
  brandPaletteSchema,
} from './brand-kit-style.contract';

/**
 * A brand kit as one ZIP file (#9710): `manifest.json` plus the logo, banner
 * and font files it names. An owner downloads it from one brand and imports it
 * into another, in the same organization or a different one. The manifest
 * refers to files by their path inside the ZIP, never by asset id, so a kit
 * carries nothing that only makes sense in the brand it came from.
 */

export const BRAND_KIT_BUNDLE_FORMAT = 'genfeed.brand-kit';
export const BRAND_KIT_BUNDLE_VERSION = 1;
export const BRAND_KIT_BUNDLE_MANIFEST_PATH = 'manifest.json';

/** The uploaded ZIP. */
export const BRAND_KIT_BUNDLE_MAX_BYTES = 64 * 1024 * 1024;
export const BRAND_KIT_BUNDLE_MANIFEST_MAX_BYTES = 256 * 1024;
export const BRAND_KIT_BUNDLE_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
export const BRAND_KIT_BUNDLE_FONT_MAX_BYTES = 4 * 1024 * 1024;
/** Everything the import unpacks, added up. */
export const BRAND_KIT_BUNDLE_UNPACKED_MAX_BYTES = 128 * 1024 * 1024;
export const BRAND_KIT_BUNDLE_MAX_FONTS = 20;

export const BRAND_KIT_BUNDLE_IMAGE_TYPES = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type BrandKitBundleImageType = keyof typeof BRAND_KIT_BUNDLE_IMAGE_TYPES;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const IMAGE_PATH = /^(logos|banners)\/[A-Za-z0-9_-]{1,64}\.(png|jpg|webp|gif)$/;
const FONT_PATH = /^fonts\/[A-Za-z0-9_-]{1,64}\.woff2$/;

const hexColor = z
  .string()
  .regex(HEX_COLOR)
  .transform((value) => value.toUpperCase());

function slotImageSchema(category: AssetCategory.LOGO | AssetCategory.BANNER) {
  return z.object({
    slot: z
      .enum(BrandKitSlot)
      .refine((slot) => isBrandKitSlotForCategory(slot, category)),
    file: z.string().regex(IMAGE_PATH),
    mimeType: z.enum(
      Object.keys(BRAND_KIT_BUNDLE_IMAGE_TYPES) as [
        BrandKitBundleImageType,
        ...BrandKitBundleImageType[],
      ],
    ),
  });
}

function isUnique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

const logoEntriesSchema = z
  .array(slotImageSchema(AssetCategory.LOGO))
  .max(16)
  .refine(
    (entries) => isUnique(entries.map((entry) => entry.slot)),
    'One logo per slot',
  );
const bannerEntriesSchema = z
  .array(slotImageSchema(AssetCategory.BANNER))
  .max(16)
  .refine(
    (entries) => isUnique(entries.map((entry) => entry.slot)),
    'One image per slot',
  );

const fontFileSchema = z.object({
  file: z.string().regex(FONT_PATH),
  name: z.string().trim().min(1).max(256),
});

/** A font role in the manifest names a font file, not an asset id. */
const manifestFontRoleSchema = z.discriminatedUnion('source', [
  z.object({ source: z.literal('preset'), fontFamily: z.enum(FontFamily) }),
  z.object({
    source: z.literal('upload'),
    file: z.string().regex(FONT_PATH),
    family: z.string().trim().min(1).max(BRAND_FONT_FAMILY_NAME_MAX),
    weight: z.number().int().min(100).max(900).multipleOf(100),
    style: z.enum(['normal', 'italic']),
  }),
]);

export const brandKitBundleManifestSchema = z
  .object({
    format: z.literal(BRAND_KIT_BUNDLE_FORMAT),
    version: z.literal(BRAND_KIT_BUNDLE_VERSION),
    exportedAt: z.string().max(64),
    brand: z.object({ label: z.string().max(256) }),
    colors: z.object({
      primary: hexColor.optional(),
      secondary: hexColor.optional(),
      background: z.union([hexColor, z.literal('transparent')]).optional(),
    }),
    fontFamily: z.enum(FontFamily).optional(),
    palette: brandPaletteSchema,
    fontRoles: z.object({
      heading: manifestFontRoleSchema.optional(),
      body: manifestFontRoleSchema.optional(),
      caption: manifestFontRoleSchema.optional(),
    }),
    fonts: z
      .array(fontFileSchema)
      .max(BRAND_KIT_BUNDLE_MAX_FONTS)
      .refine(
        (fonts) => isUnique(fonts.map((font) => font.file)),
        'Font files must be unique',
      ),
    logos: logoEntriesSchema,
    banners: bannerEntriesSchema,
  })
  .refine(
    (manifest) =>
      Object.values(manifest.fontRoles).every(
        (role) =>
          role?.source !== 'upload' ||
          manifest.fonts.some((font) => font.file === role.file),
      ),
    'A font role names a font file the kit does not list',
  )
  .refine(
    (manifest) =>
      isUnique(
        [...manifest.logos, ...manifest.banners].map((entry) => entry.file),
      ),
    'Image files must be unique',
  );

export type BrandKitBundleManifest = z.infer<
  typeof brandKitBundleManifestSchema
>;
export type BrandKitBundleFontRole = z.infer<typeof manifestFontRoleSchema>;
