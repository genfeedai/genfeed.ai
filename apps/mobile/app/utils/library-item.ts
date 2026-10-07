import type { IMetadata } from '@genfeedai/contracts/interfaces';
import type {
  ArticleItem,
  LibraryItem,
} from '@/services/api/ingredients.service';

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

export function metadataRecord(
  metadata: LibraryItem['metadata'],
): Partial<IMetadata> | null {
  if (!metadata || typeof metadata === 'string') {
    return null;
  }

  return metadata;
}

export function libraryTitle(item: LibraryItem, fallback: string): string {
  const metadata = metadataRecord(item.metadata);
  if (typeof metadata?.label === 'string' && metadata.label.trim() !== '') {
    return metadata.label;
  }

  if (
    typeof item.metadataLabel === 'string' &&
    item.metadataLabel.trim() !== ''
  ) {
    return item.metadataLabel;
  }

  return fallback;
}

export function libraryDescription(item: LibraryItem): string {
  const metadata = metadataRecord(item.metadata);
  if (typeof metadata?.description === 'string') {
    return metadata.description;
  }

  return typeof item.metadataDescription === 'string'
    ? item.metadataDescription
    : '';
}

export function libraryMediaUrl(item: LibraryItem): string | null {
  if (typeof item.cdnUrl === 'string' && item.cdnUrl !== '') {
    return item.cdnUrl;
  }

  if (typeof item.ingredientUrl === 'string' && item.ingredientUrl !== '') {
    return item.ingredientUrl;
  }

  if (typeof item.thumbnailUrl === 'string' && item.thumbnailUrl !== '') {
    return item.thumbnailUrl;
  }

  const metadata = metadataRecord(item.metadata);
  return typeof metadata?.result === 'string' && metadata.result !== ''
    ? metadata.result
    : null;
}

export function libraryCreatedAt(item: ArticleItem | LibraryItem): string {
  return typeof item.createdAt === 'string' ? item.createdAt : '';
}

export function libraryDimensions(
  item: LibraryItem,
): { height: number; width: number } | null {
  const metadata = metadataRecord(item.metadata);
  const width = positiveNumber(metadata?.width) ?? positiveNumber(item.width);
  const height =
    positiveNumber(metadata?.height) ?? positiveNumber(item.height);

  if (width === null || height === null) {
    return null;
  }

  return { height, width };
}

export function libraryDuration(item: LibraryItem): number | null {
  const metadata = metadataRecord(item.metadata);
  return (
    positiveNumber(metadata?.duration) ?? positiveNumber(item.metadataDuration)
  );
}
