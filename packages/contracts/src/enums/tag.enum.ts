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

/**
 * Where a tag is visible (#6011). Derived from the owner columns, not stored:
 * a brand tag has `brandId`, an organization-wide tag has `organizationId` and
 * no `brandId`, and a legacy default tag has neither.
 */
export enum TagScope {
  BRAND = 'brand',
  ORGANIZATION = 'organization',
  GLOBAL = 'global',
}

/** How a multi-tag Library filter combines its tags. */
export enum TagMatchMode {
  ANY = 'any',
  ALL = 'all',
}

/** What a bulk tag request does to the selected assets. */
export enum TagBulkAction {
  ADD = 'add',
  REMOVE = 'remove',
}

/** Narrow an arbitrary value to a `TagMatchMode`, or `undefined`. */
export function parseTagMatchMode(value?: unknown): TagMatchMode | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();

  return Object.values(TagMatchMode).find((mode) => mode === normalized);
}

/** Derive a tag's scope from its owner columns. */
export function resolveTagScope(tag: {
  brandId?: string | null;
  organizationId?: string | null;
}): TagScope {
  if (tag.brandId) {
    return TagScope.BRAND;
  }

  return tag.organizationId ? TagScope.ORGANIZATION : TagScope.GLOBAL;
}
