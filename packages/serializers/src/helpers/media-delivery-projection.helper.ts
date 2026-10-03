import type {
  MediaAssetProjection,
  MediaResourceProjection,
} from '@genfeedai/contracts/interfaces';

const INGREDIENT_TYPES = new Set([
  'ingredient',
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

function isRecord(value: unknown): value is Record<string, unknown> {
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
    isRecord(record.attributes)
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
    ('url' in record || 'cdnUrl' in record)
  )
    return record.ingredientId;
  return undefined;
}

function assetIdentity(record: Record<string, unknown>): string | undefined {
  if (
    record.type === 'asset' &&
    typeof record.id === 'string' &&
    isRecord(record.attributes)
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
  if (typeof record.assetId === 'string' && 'url' in record)
    return record.assetId;
  return undefined;
}

function walkRecords(
  value: unknown,
  visit: (record: Record<string, unknown>) => void,
): void {
  if (Array.isArray(value))
    value.forEach((entry) => {
      walkRecords(entry, visit);
    });
  else if (isRecord(value)) {
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
  hasCleanAccess: boolean,
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
    if (!isRecord(input)) return input;
    const output = Object.fromEntries(
      Object.entries(input).map(([key, entry]) => [key, project(entry)]),
    );
    const isResource =
      typeof input.type === 'string' &&
      typeof input.id === 'string' &&
      isRecord(input.attributes);
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
        hasCleanAccess,
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
      !hasCleanAccess &&
      (input.type === 'brand' ||
        (typeof input.slug === 'string' &&
          ('logo' in input || 'banner' in input)))
    ) {
      for (const field of [
        'logoUrl',
        'bannerUrl',
        'logo',
        'banner',
        'references',
      ])
        fields[field] = null;
    } else if (
      !hasCleanAccess &&
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
  hasCleanAccess: boolean,
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
  if (isRecord(fields.metadata))
    fields.metadata = { ...fields.metadata, result: fields.cdnUrl };
  if (!hasCleanAccess) {
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
