/**
 * Font family. Values match Prisma `FontFamily`.
 * @see packages/prisma/prisma/schema.prisma `enum FontFamily`
 *
 * Every member ships as a static TTF at
 * `apps/server/files/public/assets/fonts/<key>.ttf`, where the key is the
 * lowercase-hyphen form of the label (`MONTSERRAT_BLACK` -> `montserrat-black`).
 */
export enum FontFamily {
  MONTSERRAT_BLACK = 'MONTSERRAT_BLACK',
  MONTSERRAT_BOLD = 'MONTSERRAT_BOLD',
  MONTSERRAT_REGULAR = 'MONTSERRAT_REGULAR',
  INTER_BOLD = 'INTER_BOLD',
  POPPINS_BOLD = 'POPPINS_BOLD',
  BEBAS_NEUE = 'BEBAS_NEUE',
  ANTON = 'ANTON',
  ARCHIVO_BLACK = 'ARCHIVO_BLACK',
  BANGERS = 'BANGERS',
}

export interface FontFamilyMetadata {
  /** CSS family name, for previews that load the Google Font. */
  cssFamily: string;
  /** CSS font-weight matching the shipped TTF instance. */
  cssWeight: number;
  description: string;
  /** Lowercase-hyphen key; also the TTF file name stem. */
  key: string;
  label: string;
}

export const FONT_FAMILY_METADATA: Record<FontFamily, FontFamilyMetadata> = {
  [FontFamily.ANTON]: {
    cssFamily: 'Anton',
    cssWeight: 400,
    description: 'Tall condensed headline face for punchy hooks.',
    key: 'anton',
    label: 'Anton',
  },
  [FontFamily.ARCHIVO_BLACK]: {
    cssFamily: 'Archivo Black',
    cssWeight: 400,
    description: 'Heavy grotesque with a strong, modern presence.',
    key: 'archivo-black',
    label: 'Archivo Black',
  },
  [FontFamily.BANGERS]: {
    cssFamily: 'Bangers',
    cssWeight: 400,
    description: 'Comic-style display face for playful, loud captions.',
    key: 'bangers',
    label: 'Bangers',
  },
  [FontFamily.BEBAS_NEUE]: {
    cssFamily: 'Bebas Neue',
    cssWeight: 400,
    description: 'Clean all-caps condensed display face.',
    key: 'bebas-neue',
    label: 'Bebas Neue',
  },
  [FontFamily.INTER_BOLD]: {
    cssFamily: 'Inter',
    cssWeight: 700,
    description: 'Neutral, highly legible UI sans in bold.',
    key: 'inter-bold',
    label: 'Inter Bold',
  },
  [FontFamily.MONTSERRAT_BLACK]: {
    cssFamily: 'Montserrat',
    cssWeight: 900,
    description: 'Geometric sans at its heaviest. The default caption font.',
    key: 'montserrat-black',
    label: 'Montserrat Black',
  },
  [FontFamily.MONTSERRAT_BOLD]: {
    cssFamily: 'Montserrat',
    cssWeight: 700,
    description: 'Geometric sans in bold.',
    key: 'montserrat-bold',
    label: 'Montserrat Bold',
  },
  [FontFamily.MONTSERRAT_REGULAR]: {
    cssFamily: 'Montserrat',
    cssWeight: 400,
    description: 'Geometric sans in regular weight.',
    key: 'montserrat-regular',
    label: 'Montserrat Regular',
  },
  [FontFamily.POPPINS_BOLD]: {
    cssFamily: 'Poppins',
    cssWeight: 700,
    description: 'Friendly geometric sans in bold.',
    key: 'poppins-bold',
    label: 'Poppins Bold',
  },
};

/** Resolve a persisted enum value or its lowercase-hyphen key to a font. */
export function resolveFontFamily(
  value: string | null | undefined,
): FontFamily | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return Object.values(FontFamily).find((font) => font === normalized);
}
