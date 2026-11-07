'use client';

import { LIBRARY_ASSET_RENAME_REQUEST_EVENT } from '@genfeedai/contracts/constants';
import type {
  ILibraryAssetRenameRequest,
  IMetadata,
} from '@genfeedai/contracts/interfaces';
import { EditableText } from '@ui/primitives/editable-text';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import type {
  IngredientMetadataField,
  IngredientMetadataFieldsProps,
} from '@/props/content/ingredient.props';
import { claimPendingLibraryAssetRename } from './library-asset-metadata-event';
import { useIngredientMetadataEdit } from './use-ingredient-metadata-edit';

/**
 * The asset's name and description, each edited in place: click (or a Rename
 * action) opens the field, Enter or leaving it saves, Escape cancels. An empty
 * name is not saved.
 */
export default function IngredientMetadataFields({
  ingredient,
}: IngredientMetadataFieldsProps) {
  const translate = useTranslations('pages.library.inspector');
  const { isSaving, saveField } = useIngredientMetadataEdit(ingredient);
  const [renameRequest, setRenameRequest] = useState(0);
  const metadata =
    ingredient.metadata && typeof ingredient.metadata === 'object'
      ? (ingredient.metadata as IMetadata)
      : undefined;
  const label = metadata?.label ?? '';
  const description = metadata?.description ?? '';

  // A Rename from a tile or the header menu opens the name field, whether it
  // was asked for before this field mounted or while it is on screen.
  useEffect(() => {
    if (claimPendingLibraryAssetRename(ingredient.id)) {
      setRenameRequest((current) => current + 1);
    }

    const handleRenameRequest = (event: Event) => {
      const request = (event as CustomEvent<ILibraryAssetRenameRequest>).detail;
      if (
        request?.ingredientId === ingredient.id &&
        claimPendingLibraryAssetRename(ingredient.id)
      ) {
        setRenameRequest((current) => current + 1);
      }
    };

    window.addEventListener(
      LIBRARY_ASSET_RENAME_REQUEST_EVENT,
      handleRenameRequest,
    );
    return () =>
      window.removeEventListener(
        LIBRARY_ASSET_RENAME_REQUEST_EVENT,
        handleRenameRequest,
      );
  }, [ingredient.id]);

  const save = (field: IngredientMetadataField) => async (value: string) => {
    if (!(await saveField(field, value))) {
      throw new Error(`Saving the asset ${field} failed`);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <EditableText
        ariaLabel={translate('assetName')}
        displayClassName="truncate text-sm font-semibold text-foreground"
        editRequest={renameRequest}
        isDisabled={isSaving}
        isRequired
        maxLength={200}
        onSave={save('label')}
        placeholder={translate('untitled')}
        value={label}
      />
      <EditableText
        ariaLabel={translate('description')}
        displayClassName="text-xs leading-relaxed text-foreground/70"
        isDisabled={isSaving}
        isMultiline
        maxLength={2000}
        onSave={save('description')}
        placeholder={translate('addDescription')}
        value={description}
      />
    </div>
  );
}
