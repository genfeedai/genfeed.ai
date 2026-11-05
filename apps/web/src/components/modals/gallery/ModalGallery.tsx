'use client';

import {
  IngredientCategory,
  IngredientFormat,
  ModalEnum,
} from '@genfeedai/contracts';
import type { IIngredient } from '@genfeedai/contracts/interfaces';
import type { ModalGalleryProps } from '@genfeedai/props/modals/modal.props';
import type { GallerySelectItem } from '@genfeedai/props/modals/modal-gallery.props';
import Modal from '@ui/modals/modal/Modal';
import { useTranslations } from 'next-intl';
import { useGalleryLibrary } from '@/components/modals/gallery/hooks/useGalleryLibrary';
import { useModalGallery } from '@/components/modals/gallery/hooks/useModalGallery';
import ModalGalleryContent from '@/components/modals/gallery/ModalGalleryContent';
import ModalGalleryFooter from '@/components/modals/gallery/ModalGalleryFooter';
import ModalGalleryHeader from '@/components/modals/gallery/ModalGalleryHeader';
import ModalGalleryLibrary from '@/components/modals/gallery/ModalGalleryLibrary';
import { useModalAutoOpen } from '@/hooks/ui/use-modal-auto-open/use-modal-auto-open';

const EMPTY_ARRAY: never[] = [];

/**
 * The media picker. Images and videos are picked from the Library (its search,
 * filters and masonry grid); music from the track list; brand references from
 * the Branding tab. One fixed-height dialog with a single scroll region: the
 * header and the footer with the selection never move.
 */
export default function ModalGallery({
  isOpen,
  onClose,
  onSelect,
  category,
  title,
  selectedId,
  format = IngredientFormat.PORTRAIT,
  isNoneAllowed = false,
  maxSelectableItems,
  accountReference = null,
  onSelectAccountReference,
  selectedReferences: initialSelectedReferences = EMPTY_ARRAY,
}: ModalGalleryProps) {
  const translate = useTranslations('ui.galleryModal');
  const {
    items,
    isLoading,
    selectedItem,
    selectedItems,
    selectedItemsData,
    activeTab,
    localFormat,
    references,
    isLoadingReferences,
    setSelectedItems,
    setSelectedItemsData,
    setActiveTab,
    loadPage,
    currentPage,
    totalPages,
    handleItemSelect,
    notifySelectionLimit,
    selectionLimit,
    tabs,
  } = useModalGallery({
    category,
    format: format as IngredientFormat,
    isOpen,
    maxSelectableItems,
    selectedId,
    selectedReferences: initialSelectedReferences,
  });

  const isLibraryPicker = category !== IngredientCategory.MUSIC;
  const isLibraryTab = isLibraryPicker && activeTab === 'media';
  const library = useGalleryLibrary({
    category,
    isOpen: isOpen && isLibraryPicker,
  });

  useModalAutoOpen(ModalEnum.GALLERY, { isOpen });

  const handleClose = () => {
    onClose();
  };

  // A single-slot picker with nothing chosen yet picks on click; a multi-pick,
  // or a change to an existing choice, confirms with Add.
  const isPickedOnClick =
    selectionLimit === 1 &&
    initialSelectedReferences.length === 0 &&
    !selectedId;

  const handleToggleLibraryItem = (ingredient: IIngredient) => {
    const item = ingredient as GallerySelectItem;

    if (isPickedOnClick) {
      onSelect([item]);
      handleClose();
      return;
    }

    handleItemSelect(item);
  };

  // Preselected assets arrive as ids; their records come from the loaded grid.
  const resolveSelectedMedia = (): GallerySelectItem[] =>
    selectedItems.flatMap((id) => {
      const item =
        selectedItemsData.find((candidate) => candidate.id === id) ??
        library.items.find((candidate) => candidate.id === id);
      return item ? [item as GallerySelectItem] : [];
    });

  const handleConfirm = () => {
    if (category === IngredientCategory.MUSIC) {
      const item = selectedItem
        ? items.find((i) => i.id === selectedItem)
        : null;

      onSelect(item ? [item] : []);
      handleClose();
      return;
    }

    onSelect(resolveSelectedMedia());
    handleClose();
  };

  const handleClear = () => {
    setSelectedItems([]);
    setSelectedItemsData([]);
  };

  const handleUseAccountReference = () => {
    if (onSelectAccountReference && accountReference) {
      onSelectAccountReference([accountReference]);
    }
    handleClose();
  };

  return (
    <Modal
      id={ModalEnum.GALLERY}
      title={title || translate('title', { category })}
      size="2xl"
      isBodyScrollable={false}
      modalBoxClassName="h-[85dvh]"
      onClose={handleClose}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <ModalGalleryHeader
          category={category}
          activeTab={activeTab}
          localFormat={localFormat}
          tabs={tabs}
          accountReference={accountReference}
          onTabChange={setActiveTab}
          onUseAccountReference={handleUseAccountReference}
          onUploaded={library.onRefresh}
        />

        {isLibraryTab ? (
          <ModalGalleryLibrary
            category={category}
            library={library}
            selectedIds={selectedItems}
            onToggleItem={handleToggleLibraryItem}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <ModalGalleryContent
              category={category}
              activeTab={activeTab}
              isLoading={isLoading}
              isLoadingReferences={isLoadingReferences}
              items={items}
              references={references}
              selectedItems={selectedItems}
              selectedItem={selectedItem}
              onSelectItem={handleItemSelect}
              onSelectReference={setSelectedItems}
              onSelectionLimit={notifySelectionLimit}
              selectionLimit={selectionLimit}
            />
          </div>
        )}

        <ModalGalleryFooter
          category={category}
          activeTab={activeTab}
          isLoading={isLoading}
          selectedItems={selectedItems}
          selectedItem={selectedItem}
          isNoneAllowed={isNoneAllowed}
          onClear={handleClear}
          onSelect={onSelect}
          onSelectAccountReference={onSelectAccountReference}
          onClose={handleClose}
          onConfirm={handleConfirm}
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={loadPage}
        />
      </div>
    </Modal>
  );
}
