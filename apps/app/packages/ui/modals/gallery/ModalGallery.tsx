'use client';

import type { IAsset, IImage } from '@genfeedai/interfaces';
import {
  IngredientCategory,
  IngredientFormat,
  ModalEnum,
} from '@genfeedai/enums';
import { useModalAutoOpen } from '@hooks/ui/use-modal-auto-open/use-modal-auto-open';
import type { ModalGalleryProps } from '@props/modals/modal.props';
import { PagesService } from '@services/content/pages.service';
import { useModalGallery } from '@ui/modals/gallery/hooks/useModalGallery';
import ModalGalleryContent from '@ui/modals/gallery/ModalGalleryContent';
import ModalGalleryFooter from '@ui/modals/gallery/ModalGalleryFooter';
import ModalGalleryHeader from '@ui/modals/gallery/ModalGalleryHeader';
import Modal from '@ui/modals/modal/Modal';

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
  selectedReferences: initialSelectedReferences = [],
}: ModalGalleryProps) {
  const {
    items,
    isLoading,
    selectedItem,
    selectedItems,
    selectedItemsData,
    activeTab,
    localFormat,
    playingId,
    filterReferenceId,
    uploads,
    references,
    creations,
    isLoadingReferences,
    isLoadingCreations,
    setSelectedItems,
    setSelectedItemsData,
    setActiveTab,
    setFilterReferenceId,
    findAllItems,
    findAllUploads,
    findAllCreations,
    handleItemSelect,
    handleMusicPlayPause,
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

  useModalAutoOpen(ModalEnum.GALLERY, { isOpen });

  const handleClose = () => {
    onClose();
  };

  // Get format label
  const getFormatLabel = (formatValue?: IngredientFormat) => {
    const fmt = formatValue || localFormat;
    switch (fmt) {
      case IngredientFormat.LANDSCAPE:
        return '16:9';
      case IngredientFormat.SQUARE:
        return '1:1';
      case IngredientFormat.PORTRAIT:
        return '9:16';
      default:
        return '9:16';
    }
  };

  // Get format from image dimensions
  const getImageFormat = (image: IImage): IngredientFormat | null => {
    if (!image.width || !image.height) {
      return null;
    }
    const aspectRatio = image.width / image.height;

    if (Math.abs(aspectRatio - 16 / 9) < 0.1) {
      return IngredientFormat.LANDSCAPE;
    }

    if (Math.abs(aspectRatio - 9 / 16) < 0.1) {
      return IngredientFormat.PORTRAIT;
    }

    if (Math.abs(aspectRatio - 1) < 0.1) {
      return IngredientFormat.SQUARE;
    }

    return aspectRatio > 1
      ? IngredientFormat.LANDSCAPE
      : IngredientFormat.PORTRAIT;
  };

  const handleReferenceSelect = (selectedIds: string[]) => {
    setSelectedItems(selectedIds);
  };

  const handleItemSelectWithVideo = (item: IAsset | IImage) => {
    if (category === IngredientCategory.VIDEO) {
      onSelect(item);
      handleClose();
    } else if (
      category === IngredientCategory.IMAGE &&
      maxSelectableItems === 1 &&
      initialSelectedReferences.length === 0
    ) {
      // Immediate selection only for new single image selection (e.g., banner selection)
      // If there are pre-selected references, let user confirm their change
      onSelect(item);
      handleClose();
    } else {
      handleItemSelect(item);
    }
  };

  const handleConfirm = () => {
    if (category === IngredientCategory.MUSIC) {
      const item = selectedItem
        ? items.find((i) => i.id === selectedItem)
        : null;

      onSelect(item ?? null);
      handleClose();
    }
  };

  const handleClear = () => {
    setSelectedItems([]);
    if (category === IngredientCategory.IMAGE && activeTab === 'media') {
      setSelectedItemsData([]);
    }
  };

  const handleUseAccountReference = () => {
    if (onSelectAccountReference && accountReference) {
      onSelectAccountReference([accountReference]);
    }
    handleClose();
  };

  // Format is locked - comes from promptbar, cannot be changed

  const handleClearFilter = () => {
    setFilterReferenceId('');
    PagesService.setCurrentPage(1);
    findAllItems();
  };

  function getDefaultTitle(): string {
    switch (category) {
      case IngredientCategory.VIDEO:
        return 'Select Video';
      case IngredientCategory.MUSIC:
        return 'Select Music';
      default:
        return 'Select Image';
    }
  }

  const modalTitle = title || getDefaultTitle();

  return (
    <Modal
      id={ModalEnum.GALLERY}
      title={modalTitle}
      isFullScreen={true}
      onClose={handleClose}
    >
      <div className="flex flex-col h-full">
        {/* Sub-header with format info - only for videos */}
        {category === IngredientCategory.VIDEO && (
          <div className="text-sm text-foreground/60 -mt-4 mb-4">
            Showing {localFormat} videos ({getFormatLabel()})
          </div>
        )}

        <ModalGalleryHeader
          category={category}
          activeTab={activeTab}
          localFormat={localFormat}
          filterReferenceId={filterReferenceId}
          tabs={tabs}
          accountReference={accountReference}
          onTabChange={setActiveTab}
          onClearFilter={handleClearFilter}
          onUseAccountReference={handleUseAccountReference}
        />

        {/* Content area with scroll */}
        <div className="flex-1 overflow-y-auto p-4">
          <ModalGalleryContent
            category={category}
            activeTab={activeTab}
            isLoading={isLoading}
            isLoadingReferences={isLoadingReferences}
            isLoadingCreations={isLoadingCreations}
            items={items}
            uploads={uploads}
            references={references}
            creations={creations}
            selectedItems={selectedItems}
            selectedItem={selectedItem}
            playingId={playingId}
            localFormat={localFormat}
            onSelectItem={handleItemSelectWithVideo}
            onSelectReference={handleReferenceSelect}
            onSelectionLimit={notifySelectionLimit}
            selectionLimit={selectionLimit}
            getFormatLabel={getFormatLabel}
            getImageFormat={getImageFormat}
            onMusicPlayPause={handleMusicPlayPause}
          />
        </div>

        <ModalGalleryFooter
          category={category}
          activeTab={activeTab}
          isLoading={isLoading}
          selectedItems={selectedItems}
          selectedItemsData={selectedItemsData}
          selectedItem={selectedItem}
          isNoneAllowed={isNoneAllowed}
          onClear={handleClear}
          onSelect={onSelect}
          onSelectAccountReference={onSelectAccountReference}
          onClose={handleClose}
          onConfirm={handleConfirm}
          onPageChange={(page) => {
            PagesService.setCurrentPage(page);
            if (activeTab === 'uploads') {
              findAllUploads(page);
            } else if (activeTab === 'creations') {
              findAllCreations(page);
            } else {
              findAllItems(page);
            }
          }}
        />
      </div>
    </Modal>
  );
}
