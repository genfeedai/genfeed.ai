/**
 * Tag category. Values match Prisma `TagCategory`.
 * @see packages/prisma/prisma/schema.prisma `enum TagCategory`
 */
export enum TagCategory {
  ORGANIZATION = 'ORGANIZATION',
  CREDENTIAL = 'CREDENTIAL',
  INGREDIENT = 'INGREDIENT',
  PROMPT = 'PROMPT',
  ARTICLE = 'ARTICLE',
}

export enum TagKey {
  ENHANCED = 'enhanced',
  RESIZED = 'resized',
  UPSCALED = 'upscaled',
  REVERSED = 'reversed',
  MERGED = 'merged',
  SPLITTED = 'splitted',
  CLONED = 'cloned',
  CONVERTED = 'converted',
  MIRRORED = 'mirrored',
  PORTRAIT_BLUR = 'portrait-blur',
}
