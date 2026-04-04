'use client';

import type { GalleryItem as GalleryItemType } from '@/lib/gallery/types';
import { GalleryItem } from './GalleryItem';

interface GalleryGridProps {
  items: GalleryItemType[];
  onSelect: (item: GalleryItemType) => void;
}

export function GalleryGrid({ items, onSelect }: GalleryGridProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 [&:hover>*]:opacity-40 [&:hover>*:hover]:opacity-100">
      {items.map((item) => (
        <GalleryItem key={item.id} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}
