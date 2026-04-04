'use client';

import type { IFolder, IIngredient } from '@genfeedai/interfaces';

export const INGREDIENT_TRANSFER_MIME = 'application/x-genfeed-ingredient';

type TransferData = Pick<IIngredient, 'id' | 'folder'>;
type TransferWriter = Pick<DataTransfer, 'setData'>;
type TransferReader = Pick<DataTransfer, 'getData'>;

function normalizeFolderId(
  folder: IFolder | string | null | undefined,
): string | undefined {
  if (!folder) {
    return undefined;
  }

  if (typeof folder === 'string') {
    return folder;
  }

  return typeof folder.id === 'string' ? folder.id : undefined;
}

export function buildIngredientTransferData(
  ingredient: Pick<IIngredient, 'id' | 'folder'>,
): TransferData {
  const folderId = normalizeFolderId(
    ingredient.folder as IFolder | string | null | undefined,
  );

  return {
    folder: folderId,
    id: ingredient.id,
  };
}

export function writeIngredientTransferData(
  dataTransfer: TransferWriter,
  ingredient: Pick<IIngredient, 'id' | 'folder'>,
): void {
  const payload = JSON.stringify(buildIngredientTransferData(ingredient));

  dataTransfer.setData(INGREDIENT_TRANSFER_MIME, payload);
  dataTransfer.setData('application/json', payload);
  dataTransfer.setData('ingredientId', ingredient.id);
  dataTransfer.setData('text/plain', ingredient.id);
}

export function readIngredientTransferData(
  dataTransfer: TransferReader,
): TransferData | null {
  for (const mimeType of [INGREDIENT_TRANSFER_MIME, 'application/json']) {
    const payload = dataTransfer.getData(mimeType);

    if (!payload) {
      continue;
    }

    try {
      const parsed = JSON.parse(payload) as Partial<TransferData>;

      if (typeof parsed.id === 'string' && parsed.id !== '') {
        return {
          folder: normalizeFolderId(
            parsed.folder as IFolder | string | null | undefined,
          ),
          id: parsed.id,
        };
      }
    } catch {}
  }

  const ingredientId =
    dataTransfer.getData('ingredientId') || dataTransfer.getData('text/plain');

  if (!ingredientId) {
    return null;
  }

  return {
    folder: undefined,
    id: ingredientId,
  };
}
