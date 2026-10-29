import type {
  MediaAssetProjection,
  MediaResourceProjection,
} from '@genfeedai/contracts/interfaces';

// ts-jsonapi names an included resource after the relationship key, not the
// configured type, so the many-valued ingredient relations (post and prompt
// `ingredients`, bookmark `extractedIngredients` / `generatedIngredients`)
// arrive under their own key and need listing here.
const INGREDIENT_TYPES = new Set([
  'ingredient',
  'ingredients',
  'extractedIngredients',
  'generatedIngredients',
  'image',
  'video',
  'voice',
  'music',
  'gif',
  'avatar',
]);
const INGREDIENT_CATEGORIES = new Set([
  'IMAGE',
  'VIDEO',
  'VOICE',
  'MUSIC',
  'GIF',
  'AVATAR',
  'AUDIO',
  'IMAGE_EDIT',
  'VIDEO_EDIT',
]);

const BRAND_ASSET_CATEGORIES = new Set(['LOGO', 'BANNER', 'REFERENCE']);

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ingredientIdentity(
  record: Record<string, unknown>,
): string | undefined {
  if (
    typeof record.type === 'string' &&
    INGREDIENT_TYPES.has(record.type) &&
    typeof record.id === 'string' &&
    isPlainObjectRecord(record.attributes)
  )
    return record.id;
  if (
    typeof record.id === 'string' &&
    typeof record.category === 'string' &&
    INGREDIENT_CATEGORIES.has(record.category) &&
    ('cdnUrl' in record || 's3Key' in record)
  )
    return record.id;
  if (
    record.type === 'content_preview_card' &&
    typeof record.assetId === 'string' &&
    ['image', 'video', 'voice', 'music', 'audio'].includes(
      String(record.assetKind),
    )
  )
    return record.assetId;
  if (
    typeof record.id === 'string' &&
    typeof record.status === 'string' &&
    typeof record.url === 'string'
  )
    return record.id;
  if (
    typeof record.ingredientId === 'string' &&
    ('url' in record || 'cdnUrl' in record || 'ingredientUrl' in record)
  )
    return record.ingredientId;
  return undefined;
}

function assetIdentity(record: Record<string, unknown>): string | undefined {
  if (
    record.type === 'asset' &&
    typeof record.id === 'string' &&
    isPlainObjectRecord(record.attributes)
  )
    return record.id;
  if (
    typeof record.id === 'string' &&
    ('parentType' in record ||
      'cloudObjectKey' in record ||
      (['LOGO', 'BANNER', 'REFERENCE'].includes(String(record.category)) &&
        'cdnUrl' in record))
  )
    return record.id;
  // A JSON:API resource included through a relationship is typed after the
  // relationship key (`logo`, `banner`, `references`), not `asset`, and keeps
  // its category inside `attributes`.
  if (
    typeof record.id === 'string' &&
    isPlainObjectRecord(record.attributes) &&
    BRAND_ASSET_CATEGORIES.has(String(record.attributes.category)) &&
    'cdnUrl' in record.attributes
  )
    return record.id;
  if (typeof record.assetId === 'string' && 'url' in record)
    return record.assetId;
  return undefined;
}

function projectedAssetUrl(asset: unknown): string | null {
  if (!isPlainObjectRecord(asset)) return null;
  const attributes = isPlainObjectRecord(asset.attributes)
    ? asset.attributes
    : asset;
  return typeof attributes.cdnUrl === 'string' ? attributes.cdnUrl : null;
}

function walkRecords(
  value: unknown,
  visit: (record: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value))
    value.forEach((entry) => {
      walkRecords(entry, visit);
    });
  else if (isPlainObjectRecord(value)) {
    visit(value);
    Object.values(value).forEach((entry) => {
      walkRecords(entry, visit);
    });
  }
}

/** Inventory canonical record identities from known media response contracts. */
export function ingredientResponseIds(value: unknown): string[] {
  const ids = new Set<string>();
  walkRecords(value, (record) => {
    const id = ingredientIdentity(record);
    if (id) ids.add(id);
  });
  return [...ids];
}

export function assetResponseIds(value: unknown): string[] {
  const ids = new Set<string>();
  walkRecords(value, (record) => {
    const id = assetIdentity(record);
    if (id) ids.add(id);
  });
  return [...ids];
}

/**
 * Typed record projection, including nested JSON:API and bootstrap/import
 * contracts. No arbitrary string is parsed, rewritten or signed here. Cached
 * objects are copied; authorization always comes from canonical scoped rows.
 */
export function projectMediaResponse(
  value: unknown,
  projections: readonly MediaResourceProjection[],
  isOrganizationView: boolean,
  assets: readonly MediaAssetProjection[] = [],
): unknown {
  const ingredients = new Map(
    projections.map((projection) => [projection.ingredientId, projection]),
  );
  const metadata = new Map(
    projections
      .filter((projection) => projection.metadataId)
      .map((projection) => [projection.metadataId, projection]),
  );
  const assetUrls = new Map(assets.map((asset) => [asset.assetId, asset.url]));
  const project = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(project);
    if (!isPlainObjectRecord(input)) return input;
    const output = Object.fromEntries(
      Object.entries(input).map(([key, entry]) => [key, project(entry)]),
    );
    const isResource =
      typeof input.type === 'string' &&
      typeof input.id === 'string' &&
      isPlainObjectRecord(input.attributes);
    const fields = isResource
      ? { ...(output.attributes as Record<string, unknown>) }
      : output;
    const ingredientId = ingredientIdentity(input);
    const assetId = assetIdentity(input);
    if (ingredientId)
      projectIngredient(
        fields,
        ingredients.get(ingredientId),
        ingredientId,
        isOrganizationView,
      );
    else if (assetId) {
      fields.cdnUrl = assetUrls.get(assetId) ?? null;
      for (const field of ['url', 'publicUrl'])
        if (field in fields) fields[field] = fields.cdnUrl;
      fields.cloudObjectKey = null;
      fields.origin = null;
    } else if (input.type === 'metadata') {
      fields.result = metadata.get(String(input.id))?.grant.url ?? null;
    } else if (
      !isOrganizationView &&
      (input.type === 'brand' ||
        (typeof input.slug === 'string' &&
          ('logo' in input || 'banner' in input)))
    ) {
      // The logo and banner are brand identity, not generated media: their
      // asset records were already projected above (signed for the brand's own
      // members, null when unavailable), so only the original reference images
      // stay withheld. The derived URL follows the projected logo.
      fields.references = null;
      fields.logoUrl = projectedAssetUrl(fields.logo);
      fields.bannerUrl = projectedAssetUrl(fields.banner);
    } else if (
      !isOrganizationView &&
      (input.type === 'organization-setting' ||
        'defaultAvatarPhotoUrl' in input)
    ) {
      fields.defaultAvatarPhotoUrl = null;
    }
    return isResource ? { ...output, attributes: fields } : fields;
  };
  return project(value);
}

function projectIngredient(
  fields: Record<string, unknown>,
  projection: MediaResourceProjection | undefined,
  id: string,
  isOrganizationView: boolean,
): void {
  fields.cdnUrl = projection?.grant.url ?? null;
  fields.s3Key = null;
  if (fields.type === 'content_preview_card') {
    for (const media of ['images', 'videos', 'audio'])
      if (Array.isArray(fields[media]))
        fields[media] = projection?.grant.url ? [projection.grant.url] : [];
  }
  fields.mediaDelivery = projection?.grant ?? {
    expiresAt: null,
    id,
    purpose: 'preview',
    state: 'UNSUPPORTED',
    url: null,
  };
  for (const field of [
    'url',
    'publicUrl',
    'ingredientUrl',
    'mediaUrl',
    'downloadUrl',
  ]) {
    if (field in fields) fields[field] = fields.cdnUrl;
  }
  if (isPlainObjectRecord(fields.metadata))
    fields.metadata = { ...fields.metadata, result: fields.cdnUrl };
  // Rows that reference an ingredient (analytics top content) have no
  // generated video thumbnail to sign; images are their own preview.
  if ('ingredientId' in fields && 'thumbnailUrl' in fields)
    fields.thumbnailUrl = fields.isVideo === true ? null : fields.cdnUrl;
  if (!isOrganizationView) {
    for (const field of [
      'generationHarness',
      'imageEdit',
      'reference',
      'endFrame',
      'sources',
      'references',
      'thumbnailUrl',
      'brandLogoUrl',
    ])
      if (field in fields) fields[field] = null;
  }
}

/**
 * Mirrored provider profile photos (`credentials.externalAvatar`) live under
 * this CDN prefix. They are persisted as plain CDN URLs, but a private CDN
 * returns 403 for an unsigned one, so every response re-signs them on read.
 */
const SOCIAL_AVATAR_PATH_PREFIX = '/ingredients/social-avatars/';

function isSocialAvatarUrl(value: string): boolean {
  if (
    !/^https?:\/\//i.test(value) ||
    !value.includes(SOCIAL_AVATAR_PATH_PREFIX)
  )
    return false;
  try {
    const { pathname } = new URL(value);
    return (
      pathname.startsWith(SOCIAL_AVATAR_PATH_PREFIX) &&
      pathname.length > SOCIAL_AVATAR_PATH_PREFIX.length
    );
  } catch {
    return false;
  }
}

/**
 * Re-signs mirrored social avatar URLs wherever a response carries them
 * (credential resources, post credentials, analytics accounts, timelines).
 * The prefix holds only copies of public provider profile photos, never
 * tenant media, so it is the one place a CDN URL may be signed without an
 * ingredient or asset record behind it. A URL that cannot be signed is
 * withheld (`null`) rather than left as an unsigned link. The input is never
 * mutated: cached responses stay intact.
 */
export function projectSocialAvatarUrls(
  value: unknown,
  signUrl: (url: string) => string,
): unknown {
  if (typeof value === 'string') {
    if (!isSocialAvatarUrl(value)) return value;
    try {
      return signUrl(value);
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    const projected = value.map((entry) =>
      projectSocialAvatarUrls(entry, signUrl),
    );
    return projected.some((entry, index) => entry !== value[index])
      ? projected
      : value;
  }
  if (!isPlainObjectRecord(value)) return value;
  let hasChanged = false;
  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const projected = projectSocialAvatarUrls(entry, signUrl);
    if (projected !== entry) hasChanged = true;
    output[key] = projected;
  }
  return hasChanged ? output : value;
}
