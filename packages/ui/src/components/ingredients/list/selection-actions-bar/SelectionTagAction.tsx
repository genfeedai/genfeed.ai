'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonVariant, TagBulkAction } from '@genfeedai/contracts';
import { LIBRARY_BULK_TAG_LIMIT } from '@genfeedai/contracts/constants';
import type { IIngredient, ITag } from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import LibraryTagPicker, {
  type LibraryTagPickerState,
} from '@ui/tags/library-tag-picker/LibraryTagPicker';
import { useLibraryTagWrites } from '@ui/tags/library-tag-picker/use-library-tag-writes';
import { useLibraryTags } from '@ui/tags/library-tag-picker/use-library-tags';
import { Tag } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

/**
 * Tag every selected asset in one action. A tag every selected asset already
 * carries is shown checked and clicking it removes it from all of them; a tag
 * on some or none is added to all. The result reports how many changed and how
 * many were skipped (assets the member cannot edit).
 */
export default function SelectionTagAction({
  selectedIngredients,
}: {
  selectedIngredients: readonly IIngredient[];
}) {
  const translate = useTranslations('pages.library.tags');
  const { brandId } = useBrand();
  const { createTag, isLoading, tags } = useLibraryTags({
    brandId: brandId || undefined,
  });
  const { applyTag, isWriting } = useLibraryTagWrites();

  const count = selectedIngredients.length;
  const isOverLimit = count > LIBRARY_BULK_TAG_LIMIT;
  const ids = useMemo(
    () => selectedIngredients.map((ingredient) => ingredient.id),
    [selectedIngredients],
  );

  const states = useMemo(() => {
    const carried = new Map<string, number>();
    for (const ingredient of selectedIngredients) {
      for (const tag of ingredient.tags ?? []) {
        carried.set(tag.id, (carried.get(tag.id) ?? 0) + 1);
      }
    }

    return new Map<string, LibraryTagPickerState>(
      [...carried].map(([tagId, carriedBy]) => [
        tagId,
        carriedBy === count ? 'all' : 'some',
      ]),
    );
  }, [count, selectedIngredients]);

  const handleToggle = (
    tag: ITag,
    state: LibraryTagPickerState | undefined,
  ): void => {
    void applyTag(
      state === 'all' ? TagBulkAction.REMOVE : TagBulkAction.ADD,
      tag,
      ids,
    );
  };

  const handleCreate = async (label: string): Promise<void> => {
    try {
      const tag = await createTag(label);
      await applyTag(TagBulkAction.ADD, tag, ids);
    } catch (error: unknown) {
      logger.error('Failed to create Library tag', error);
      NotificationsService.getInstance().error(translate('createFailed'));
    }
  };

  return (
    <LibraryTagPicker
      isBusy={isWriting}
      isLoading={isLoading}
      onCreate={(label) => {
        void handleCreate(label);
      }}
      onToggle={handleToggle}
      states={states}
      tags={tags}
      trigger={
        <Button
          isDisabled={isOverLimit || count === 0}
          label={
            <>
              <Tag /> {translate('tagAction')}
            </>
          }
          tooltip={
            isOverLimit
              ? translate('overLimit', { limit: LIBRARY_BULK_TAG_LIMIT })
              : translate('tagSelected', { count })
          }
          variant={ButtonVariant.SECONDARY}
        />
      }
    />
  );
}
