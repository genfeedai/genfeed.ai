'use client';
import { IngredientCategory } from '@genfeedai/contracts';
import type { IMusic } from '@genfeedai/contracts/interfaces';
import type { ModalGalleryContentProps } from '@genfeedai/props/modals/modal-gallery.props';
import CollectionGrid from '@ui/collection/CollectionGrid';
import { SkeletonList } from '@ui/display/skeleton/skeleton';
import { EmptyState } from '@ui/primitives/empty-state';
import { Music } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ModalGalleryItemMusic from '@/components/modals/gallery/items/ModalGalleryItemMusic';
import ModalGalleryReferencesTab from '@/components/modals/gallery/ModalGalleryReferencesTab';

const EMPTY_ARRAY: never[] = [];

/**
 * The paged lists the picker still owns: brand references and music tracks.
 * Images and videos are picked from the Library grid instead.
 */
export default function ModalGalleryContent({
  category,
  activeTab,
  isLoading,
  isLoadingReferences = false,
  items,
  references = EMPTY_ARRAY,
  selectedItems,
  selectedItem,
  onSelectItem,
  onSelectReference,
  onSelectionLimit,
  selectionLimit,
}: ModalGalleryContentProps) {
  const translate = useTranslations('ui.galleryModal');
  if (activeTab === 'references' && category === IngredientCategory.IMAGE) {
    return (
      <ModalGalleryReferencesTab
        references={references}
        isLoadingReferences={isLoadingReferences}
        selectedItems={selectedItems}
        onSelectReference={onSelectReference}
        onSelectionLimit={onSelectionLimit}
        selectionLimit={selectionLimit}
      />
    );
  }

  if (isLoading) {
    return <SkeletonList count={12} />;
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Music}
        title={translate('musicEmpty.title')}
        description={translate('musicEmpty.description')}
      />
    );
  }

  return (
    <CollectionGrid maxColumns={3}>
      {items.map((item) => (
        <ModalGalleryItemMusic
          key={item.id}
          music={item as IMusic}
          isSelected={selectedItem === item.id}
          onSelect={onSelectItem}
        />
      ))}
    </CollectionGrid>
  );
}
