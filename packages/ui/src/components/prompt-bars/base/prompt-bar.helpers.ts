import type { IAsset, IIngredient } from '@genfeedai/contracts/interfaces';
import type { MediaReference } from '@genfeedai/contracts/interfaces/components/media-reference.interface';
import type { PromptBarAttachedAsset } from '@genfeedai/props/studio/prompt-bar.props';
import type { DragEvent } from 'react';

export const EMPTY_ARRAY: never[] = [];

/**
 * Prompt textarea grows from one line to five (text-sm leading-5 = 20px per
 * line + 16px vertical padding), then scrolls — Cursor-style composer input.
 */
export const PROMPT_BAR_TEXTAREA_MAX_HEIGHT = 116;

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
  asset: MediaReference,
  role: 'reference' | 'startFrame' | 'endFrame',
  source: 'upload' | 'library',
): PromptBarAttachedAsset {
  return {
    id: asset.id,
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
): MediaReference | null {
  if (!uploaded?.id) {
    return null;
  }

  return {
    id: uploaded.id,
    ingredientUrl:
      'ingredientUrl' in uploaded && typeof uploaded.ingredientUrl === 'string'
        ? uploaded.ingredientUrl
        : undefined,
    metadataHeight:
      'metadataHeight' in uploaded &&
      typeof uploaded.metadataHeight === 'number'
        ? uploaded.metadataHeight
        : undefined,
    metadataWidth:
      'metadataWidth' in uploaded && typeof uploaded.metadataWidth === 'number'
        ? uploaded.metadataWidth
        : undefined,
    name:
      'name' in uploaded && typeof uploaded.name === 'string'
        ? uploaded.name
        : undefined,
    title:
      'title' in uploaded && typeof uploaded.title === 'string'
        ? uploaded.title
        : undefined,
  };
}
