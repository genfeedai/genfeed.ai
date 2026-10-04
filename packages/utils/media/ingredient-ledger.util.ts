import { IngredientStatus } from '@genfeedai/contracts';
import type { IIngredient, IMetadata } from '@genfeedai/contracts/interfaces';
import { formatDuration } from '@genfeedai/helpers';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function getMetadata(ingredient: IIngredient): IMetadata | undefined {
  return typeof ingredient.metadata === 'object'
    ? (ingredient.metadata as IMetadata)
    : undefined;
}

function firstNonEmpty(
  ...values: Array<string | null | undefined>
): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim();
    }
  }

  return null;
}

/**
 * What actually produced this asset. `modelUsed` is the ledger column written
 * at generation time and outranks the display label, which a later metadata
 * refresh can overwrite.
 */
export function getIngredientModelLabel(
  ingredient: IIngredient,
): string | null {
  return firstNonEmpty(
    ingredient.modelUsed,
    ingredient.metadataModelLabel,
    ingredient.metadataModel,
    ingredient.model,
    getMetadata(ingredient)?.model,
  );
}

export function getIngredientProviderLabel(
  ingredient: IIngredient,
): string | null {
  return firstNonEmpty(ingredient.provider);
}

export function formatIngredientFileSize(
  bytes: number | null | undefined,
): string | null {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const rounded =
    unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;

  return `${rounded} ${BYTE_UNITS[unitIndex]}`;
}

/**
 * One "size" cell for every asset type. A still is measured in pixels, a
 * time-based asset in duration, and anything the ledger only knows the weight
 * of falls back to bytes rather than rendering an empty column.
 */
export function getIngredientSizeLabel(ingredient: IIngredient): string | null {
  const metadata = getMetadata(ingredient);

  const duration = ingredient.metadataDuration ?? metadata?.duration;
  if (typeof duration === 'number' && duration > 0) {
    return formatDuration(duration);
  }

  const width = ingredient.metadataWidth ?? ingredient.width ?? metadata?.width;
  const height =
    ingredient.metadataHeight ?? ingredient.height ?? metadata?.height;

  if (
    typeof width === 'number' &&
    typeof height === 'number' &&
    width > 0 &&
    height > 0
  ) {
    return `${width} × ${height}`;
  }

  return formatIngredientFileSize(
    ingredient.fileSize ?? ingredient.metadataSize,
  );
}

/**
 * Pixel dimensions from the stored metadata. The client model's
 * `metadataWidth`/`metadataHeight` getters fall back to a 1080 × 1920
 * placeholder, so they are deliberately not read here: an asset that was never
 * measured shows no dimensions rather than invented ones.
 */
export function getIngredientDimensionsLabel(
  ingredient: IIngredient,
): string | null {
  const metadata = getMetadata(ingredient);
  const width = metadata?.width ?? ingredient.width;
  const height = metadata?.height ?? ingredient.height;

  if (
    typeof width === 'number' &&
    typeof height === 'number' &&
    width > 0 &&
    height > 0
  ) {
    return `${width} × ${height}`;
  }

  return null;
}

/** Playback length of a time-based asset; null for stills. */
export function getIngredientDurationLabel(
  ingredient: IIngredient,
): string | null {
  const duration = getMetadata(ingredient)?.duration;

  return typeof duration === 'number' && duration > 0
    ? formatDuration(duration)
    : null;
}

/** The stored file format, e.g. `PNG`, falling back to the recorded MIME type. */
export function getIngredientFormatLabel(
  ingredient: IIngredient,
): string | null {
  return (
    firstNonEmpty(getMetadata(ingredient)?.extension)?.toUpperCase() ??
    firstNonEmpty(ingredient.mimeType)
  );
}

export function getIngredientStyleLabel(
  ingredient: IIngredient,
): string | null {
  return firstNonEmpty(
    ingredient.metadataStyle,
    getMetadata(ingredient)?.style,
    ingredient.style,
  );
}

/**
 * The prompt that produced the asset. The linked prompt record is the edited,
 * user-facing text; the ledger's `generationPrompt` covers generations that
 * never linked one.
 */
export function getIngredientPromptText(
  ingredient: IIngredient,
): string | null {
  // Not `firstNonEmpty`: a prompt keeps its own whitespace.
  for (const text of [ingredient.promptText, ingredient.generationPrompt]) {
    if (typeof text === 'string' && text.trim() !== '') {
      return text;
    }
  }

  return null;
}

export function isFailedIngredient(ingredient: IIngredient): boolean {
  return ingredient.status === IngredientStatus.FAILED;
}

/**
 * The operator-facing reason a generation failed. Returns null for anything
 * that did not fail, so a stale ledger entry on a since-succeeded asset never
 * shows up as an error.
 */
export function getIngredientFailureReason(
  ingredient: IIngredient,
): string | null {
  if (!isFailedIngredient(ingredient)) {
    return null;
  }

  return firstNonEmpty(ingredient.generationError);
}
