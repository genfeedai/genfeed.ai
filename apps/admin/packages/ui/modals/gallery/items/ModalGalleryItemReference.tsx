'use client';

import type { ModalGalleryItemReferenceProps } from '@props/modals/modal-gallery.props';
import { EnvironmentService } from '@services/core/environment.service';
import Image from 'next/image';

export default function ModalGalleryItemReference({
  reference,
  isSelected,
  onSelect,
  onSelectionLimit,
  selectionLimit,
  selectedItems,
}: ModalGalleryItemReferenceProps) {
  const handleClick = () => {
    if (selectedItems.includes(reference.id)) {
      // Remove from selection
      const newSelected = selectedItems.filter((id) => id !== reference.id);
      onSelect(newSelected);
    } else {
      if (selectionLimit === 1) {
        onSelect([reference.id]);
      } else if (selectedItems.length < selectionLimit) {
        onSelect([...selectedItems, reference.id]);
      } else {
        onSelectionLimit();
      }
    }
  };

  return (
    <div
      key={reference.id}
      className="cursor-pointer group"
      onClick={handleClick}
    >
      <div
        className={`relative w-full pb-[100%] bg-background overflow-hidden shadow-md ${isSelected ? 'ring-4 ring-primary' : ''}`}
      >
        <Image
          src={`${EnvironmentService.ingredientsEndpoint}/references/${reference.id}`}
          alt={reference.id}
          fill
          className="object-cover transition-all duration-300 transform-gpu opacity-80 hover:opacity-100 hover:rotate-1 hover:scale-[1.02] hover:translate-y-1"
          sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 20vw"
        />

        {isSelected && (
          <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold z-10">
            ✓
          </div>
        )}
      </div>
    </div>
  );
}
