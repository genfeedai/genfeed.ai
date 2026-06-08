import { IngredientFormat } from '@genfeedai/enums';
import type { IAsset, IImage, IIngredient } from '@genfeedai/interfaces';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type { DragEvent } from 'react';

export const EMPTY_ARRAY: never[] = [];

export function getAspectRatioFromFormat(format: IngredientFormat): string {
  switch (format) {
    case IngredientFormat.PORTRAIT:
      return '9:16';
    case IngredientFormat.SQUARE:
      return '1:1';
    default:
      return '16:9';
  }
}

export function resizeTextarea(
  textarea: HTMLTextAreaElement | null,
  maxHeight: number,
): void {
  if (!textarea) {
    return;
  }
  Object.assign(textarea.style, { height: 'auto' });

  if (textarea.scrollHeight > maxHeight) {
    Object.assign(textarea.style, {
      height: `${maxHeight}px`,
      overflowY: 'auto',
    });
  } else {
    Object.assign(textarea.style, {
      height: `${textarea.scrollHeight}px`,
      overflowY: 'hidden',
    });
  }
}

export function isFileDrag(event: DragEvent<HTMLDivElement>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

export function toAttachedPromptAsset(
  asset: IAsset | IImage,
  role: 'reference' | 'startFrame' | 'endFrame',
  source: 'upload' | 'library',
): PromptBarAttachedAsset {
  return {
    id: asset.id as string,
    kind: 'image',
    name:
      ('title' in asset && typeof asset.title === 'string' && asset.title) ||
      ('name' in asset && typeof asset.name === 'string' && asset.name) ||
      undefined,
    previewUrl:
      ('ingredientUrl' in asset && typeof asset.ingredientUrl === 'string'
        ? asset.ingredientUrl
        : undefined) || undefined,
    role,
    source,
  };
}

export function normalizeUploadedReference(
  uploaded: IIngredient | IAsset,
): IAsset | IImage | null {
  if (!uploaded?.id) {
    return null;
  }

  const maybeUploaded = uploaded as unknown as Record<string, unknown>;

  return {
    id: uploaded.id,
    ingredientUrl:
      typeof maybeUploaded.ingredientUrl === 'string'
        ? maybeUploaded.ingredientUrl
        : undefined,
    metadataHeight:
      typeof maybeUploaded.metadataHeight === 'number'
        ? maybeUploaded.metadataHeight
        : undefined,
    metadataWidth:
      typeof maybeUploaded.metadataWidth === 'number'
        ? maybeUploaded.metadataWidth
        : undefined,
    name:
      typeof maybeUploaded.name === 'string' ? maybeUploaded.name : undefined,
    title:
      typeof maybeUploaded.title === 'string' ? maybeUploaded.title : undefined,
  } as unknown as IAsset | IImage;
}
