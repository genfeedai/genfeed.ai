import { IngredientStatus } from '@genfeedai/enums';
import { formatDuration } from '@genfeedai/helpers';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';

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
