'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { ButtonVariant, TagBulkAction } from '@genfeedai/contracts';
import type {
  IIngredient,
  ITag,
  ITagColorSwatch,
} from '@genfeedai/contracts/interfaces';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import LibraryTagChip from '@ui/tags/library-tag-picker/LibraryTagChip';
import LibraryTagPicker, {
  type LibraryTagPickerState,
} from '@ui/tags/library-tag-picker/LibraryTagPicker';
import { useLibraryTagWrites } from '@ui/tags/library-tag-picker/use-library-tag-writes';
import { useLibraryTags } from '@ui/tags/library-tag-picker/use-library-tags';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const NO_TAGS: ITag[] = [];

/**
 * Tags on one asset: its chips with a remove button each, and one "Add tag"
 * control that opens the picker, where a new label is created and attached in
 * the same action. Two interactions add or remove a tag. The picker only ever
 * offers the active brand's tags plus organization-wide tags.
 */
export default function IngredientTagsControl({
  ingredient,
}: {
  ingredient: IIngredient;
}) {
  const translate = useTranslations('pages.library.tags');
  const { brandId } = useBrand();
  const {
    createTag,
    isLoading,
    tags: availableTags,
  } = useLibraryTags({
    brandId: brandId || undefined,
  });
  const { applyTag, isWriting } = useLibraryTagWrites();
  const [assetTags, setAssetTags] = useState<ITag[]>(
    ingredient.tags ?? NO_TAGS,
  );

  // The list republishes the asset after every write, and a different asset
  // brings its own tags; follow both.
  useEffect(() => {
    setAssetTags(ingredient.tags ?? NO_TAGS);
  }, [ingredient.tags]);

  const states = useMemo(
    () =>
      new Map<string, LibraryTagPickerState>(
        assetTags.map((tag) => [tag.id, 'all']),
      ),
    [assetTags],
  );

  const handleAdd = async (tag: ITag): Promise<void> => {
    const outcome = await applyTag(TagBulkAction.ADD, tag, [ingredient.id]);
    if (outcome?.changedIds.includes(ingredient.id)) {
      setAssetTags((current) =>
        current.some((existing) => existing.id === tag.id)
          ? current
          : [...current, tag],
      );
    }
  };

  const handleRemove = async (tag: Pick<ITag, 'id'>): Promise<void> => {
    const known = assetTags.find((existing) => existing.id === tag.id);
    if (!known) {
      return;
    }
    const outcome = await applyTag(TagBulkAction.REMOVE, known, [
      ingredient.id,
    ]);
    if (outcome?.changedIds.includes(ingredient.id)) {
      setAssetTags((current) =>
        current.filter((existing) => existing.id !== tag.id),
      );
    }
  };

  const handleToggle = (
    tag: ITag,
    state: LibraryTagPickerState | undefined,
  ): void => {
    void (state ? handleRemove(tag) : handleAdd(tag));
  };

  const handleCreate = async (
    label: string,
    color: ITagColorSwatch | undefined,
  ): Promise<void> => {
    try {
      const tag = await createTag(label, undefined, color);
      await handleAdd(tag);
    } catch (error: unknown) {
      logger.error('Failed to create Library tag', error);
      NotificationsService.getInstance().error(translate('createFailed'));
    }
  };

  return (
    <section
      aria-label={translate('sectionLabel')}
      className="flex flex-col gap-2"
    >
      <div className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
        {translate('sectionLabel')}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {assetTags.map((tag) => (
          <LibraryTagChip
            key={tag.id}
            onRemove={isWriting ? undefined : handleRemove}
            removeLabel={translate('removeTag', { label: tag.label })}
            tag={tag}
          />
        ))}
        <LibraryTagPicker
          isBusy={isWriting}
          isLoading={isLoading}
          onCreate={(label, color) => {
            void handleCreate(label, color);
          }}
          onToggle={handleToggle}
          states={states}
          tags={availableTags}
          trigger={
            <Button
              ariaLabel={translate('addTag')}
              className="inline-flex h-control-sm shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-dashed border-foreground/25 px-2.5 text-xs text-foreground/60 hover:text-foreground"
              icon={<Plus className="size-3" />}
              label={translate('addTag')}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            />
          }
        />
      </div>
      {assetTags.length === 0 ? (
        <p className="text-xs text-foreground/45">{translate('emptyHint')}</p>
      ) : null}
    </section>
  );
}
