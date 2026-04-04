import { IngredientFormat } from '@genfeedai/enums';
import { calculateAspectRatio } from '@genfeedai/helpers';
import type { IIngredient } from '@genfeedai/interfaces';

const PORTRAIT_RATIOS = ['9:16', '3:4', '2:3', '4:5', '1:2'];

type IngredientSource = Partial<
  Pick<
    IIngredient,
    'metadata' | 'metadataWidth' | 'metadataHeight' | 'width' | 'height'
  >
>;

function extractDimensions(source: IngredientSource): {
  width: number;
  height: number;
} {
  const metadataObj =
    source.metadata && typeof source.metadata === 'object'
      ? source.metadata
      : null;

  let width =
    metadataObj?.width ?? source.metadataWidth ?? source.width ?? null;
  let height =
    metadataObj?.height ?? source.metadataHeight ?? source.height ?? null;

  if (!width || width <= 0 || !height || height <= 0) {
    const sourceRecord = source as Record<string, unknown>;
    const metaWidth = sourceRecord.metadataWidth;
    const metaHeight = sourceRecord.metadataHeight;

    if (
      typeof metaWidth === 'number' &&
      metaWidth > 0 &&
      typeof metaHeight === 'number' &&
      metaHeight > 0
    ) {
      width = metaWidth;
      height = metaHeight;
    }
  }

  return { height: height ?? 0, width: width ?? 0 };
}

export function resolveIngredientAspectRatio(
  source?: IngredientSource | null,
): IngredientFormat {
  if (!source) {
    return IngredientFormat.PORTRAIT;
  }

  const { width, height } = extractDimensions(source);
  const ratio = calculateAspectRatio(width, height);

  if (ratio === '1:1') {
    return IngredientFormat.SQUARE;
  }

  if (PORTRAIT_RATIOS.includes(ratio)) {
    return IngredientFormat.PORTRAIT;
  }

  return IngredientFormat.LANDSCAPE;
}
