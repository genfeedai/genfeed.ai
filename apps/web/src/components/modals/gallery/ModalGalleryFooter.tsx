'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/contracts';
import type { ModalGalleryFooterProps } from '@genfeedai/props/modals/modal-gallery.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Pagination from '@ui/navigation/pagination/Pagination';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';

/**
 * The picker's fixed footer: what is selected and how to confirm it. Images
 * and videos confirm with Add; brand references with their own select; music
 * keeps its "continue without music" choice. Only the paged lists (music and
 * references) show page numbers; the Library grid loads more as it scrolls.
 */
export default function ModalGalleryFooter({
  category,
  currentPage,
  totalPages,
  activeTab,
  isLoading,
  selectedItems,
  selectedItem,
  isNoneAllowed,
  onClear,
  onSelect,
  onSelectAccountReference,
  onClose,
  onConfirm,
  onPageChange,
}: ModalGalleryFooterProps) {
  const translate = useTranslations('ui.galleryModal');
  const isMusic = category === IngredientCategory.MUSIC;
  const isReferences = activeTab === 'references';
  const isPaged = isMusic || isReferences;
  const count = selectedItems.length;

  const handleSelectReferences = () => {
    const referencesData = selectedItems.map((id) => ({
      id,
      url: `${EnvironmentService.cdnUrl}/references/${id}`,
    }));

    if (onSelectAccountReference && referencesData.length > 0) {
      onSelectAccountReference(referencesData);
    }
    onClose();
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-4">
      {isPaged && !isLoading ? (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={onPageChange}
        />
      ) : null}

      {isMusic ? null : (
        <span
          aria-live="polite"
          className="text-sm text-muted-foreground tabular-nums"
        >
          {translate('selectedCount', { count })}
        </span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {isMusic ? (
          <>
            {selectedItem ? (
              <Button
                label={translate('clear')}
                onClick={() => onSelect([])}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
              />
            ) : null}
            <Button
              label={translate('cancel')}
              onClick={onClose}
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
            />
            <Button
              label={selectedItem ? 'Select Music' : 'Continue Without Music'}
              onClick={onConfirm}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              isDisabled={!isNoneAllowed && !selectedItem}
            />
          </>
        ) : (
          <>
            {count > 0 ? (
              <Button
                label={translate('clear')}
                onClick={onClear}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.SM}
              />
            ) : null}
            <Button
              label={translate('cancel')}
              onClick={onClose}
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
            />
            <Button
              label={translate('add', { count })}
              onClick={isReferences ? handleSelectReferences : onConfirm}
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              isDisabled={count === 0}
            />
          </>
        )}
      </div>
    </div>
  );
}
