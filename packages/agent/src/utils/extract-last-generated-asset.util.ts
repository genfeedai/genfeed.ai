export type LastGeneratedAssetKind = 'audio' | 'image' | 'video';

export interface LastGeneratedAsset {
  kind: LastGeneratedAssetKind;
  url: string;
}

export interface LastGeneratedIngredientCandidate {
  createdAt?: string;
  kind?: LastGeneratedAssetKind;
  url: string;
}

const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];
const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.m4a', '.ogg'];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const url = value.trim();
  return url.length > 0 ? url : null;
}

function kindFromUrl(url: string): LastGeneratedAssetKind {
  const path = (url.split('?')[0] ?? url).toLowerCase();
  if (VIDEO_EXTENSIONS.some((extension) => path.endsWith(extension))) {
    return 'video';
  }
  if (AUDIO_EXTENSIONS.some((extension) => path.endsWith(extension))) {
    return 'audio';
  }
  return 'image';
}

function isDisplayableImageUrl(url: string): boolean {
  return kindFromUrl(url) === 'image';
}

function assetFromUrl(
  url: string | null,
  kind?: LastGeneratedAssetKind,
): LastGeneratedAsset | null {
  if (!url || !isDisplayableImageUrl(url)) {
    return null;
  }

  return {
    kind: kind ?? kindFromUrl(url),
    url,
  };
}

function lastUrl(values: unknown): string | null {
  const urls = asArray(values)
    .map((value) => readUrl(value))
    .filter((value): value is string => Boolean(value));
  return urls.at(-1) ?? null;
}

function parseEpochTime(timestamp?: string): number | null {
  if (!timestamp) {
    return null;
  }

  const epochTime = Date.parse(timestamp);
  return Number.isNaN(epochTime) ? null : epochTime;
}

function extractFromIngredient(value: unknown): LastGeneratedAsset | null {
  const ingredient = asRecord(value);
  if (!ingredient) {
    return null;
  }

  const thumbnail = assetFromUrl(
    readUrl(ingredient.thumbnailUrl),
    ingredient.type === 'video' ? 'video' : 'image',
  );
  if (thumbnail) {
    return thumbnail;
  }

  return assetFromUrl(
    readUrl(ingredient.url),
    ingredient.type === 'video' ? 'video' : 'image',
  );
}

function extractFromOutputVariant(value: unknown): LastGeneratedAsset | null {
  const variant = asRecord(value);
  if (!variant) {
    return null;
  }

  const kind =
    variant.kind === 'video' ||
    variant.kind === 'audio' ||
    variant.kind === 'image'
      ? variant.kind
      : undefined;

  return (
    assetFromUrl(readUrl(variant.thumbnailUrl), kind) ??
    assetFromUrl(readUrl(variant.url), kind)
  );
}

function extractFromAction(value: unknown): LastGeneratedAsset | null {
  const action = asRecord(value);
  if (!action) {
    return null;
  }

  const lastImage = assetFromUrl(lastUrl(action.images), 'image');
  if (lastImage) {
    return lastImage;
  }

  const ingredients = asArray(action.ingredients);
  for (let index = ingredients.length - 1; index >= 0; index -= 1) {
    const ingredient = extractFromIngredient(ingredients[index]);
    if (ingredient) {
      return ingredient;
    }
  }

  const lastVideoPoster = assetFromUrl(lastUrl(action.videos), 'video');
  if (lastVideoPoster) {
    return lastVideoPoster;
  }

  const variants = asArray(action.outputVariants);
  for (let index = variants.length - 1; index >= 0; index -= 1) {
    const variant = extractFromOutputVariant(variants[index]);
    if (variant) {
      return variant;
    }
  }

  return assetFromUrl(readUrl(action.thumbnailUrl));
}

export function extractLastGeneratedAssetFromMetadata(
  metadata: unknown,
): LastGeneratedAsset | null {
  const record = asRecord(metadata);
  if (!record) {
    return null;
  }

  const actions = asArray(record.uiActions);
  for (let index = actions.length - 1; index >= 0; index -= 1) {
    const asset = extractFromAction(actions[index]);
    if (asset) {
      return asset;
    }
  }

  return assetFromUrl(readUrl(record.mediaUrl));
}

export function extractLastGeneratedAssetFromMessages(
  messages: Array<{ metadata?: unknown }>,
): LastGeneratedAsset | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const asset = extractLastGeneratedAssetFromMetadata(
      messages[index]?.metadata,
    );
    if (asset) {
      return asset;
    }
  }

  return null;
}

export function resolveLastGeneratedAsset(input: {
  ingredient?: LastGeneratedIngredientCandidate | null;
  metadata?: unknown;
  metadataCreatedAt?: string;
}): LastGeneratedAsset | null {
  const fromMetadata = extractLastGeneratedAssetFromMetadata(input.metadata);
  const fromIngredient = input.ingredient?.url
    ? {
        kind: input.ingredient.kind ?? kindFromUrl(input.ingredient.url),
        url: input.ingredient.url,
      }
    : null;

  if (fromMetadata && fromIngredient) {
    const metadataEpochTime = parseEpochTime(input.metadataCreatedAt);
    const ingredientEpochTime = parseEpochTime(input.ingredient?.createdAt);

    if (metadataEpochTime === null || ingredientEpochTime === null) {
      return fromMetadata;
    }

    return metadataEpochTime >= ingredientEpochTime
      ? fromMetadata
      : fromIngredient;
  }

  return fromMetadata ?? fromIngredient;
}
