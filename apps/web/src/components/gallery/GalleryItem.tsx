'use client';

import { Film, ImageIcon, Music } from 'lucide-react';
import Image from 'next/image';
import { memo } from 'react';
import type { GalleryItem as GalleryItemType } from '@/lib/gallery/types';

interface GalleryItemProps {
  item: GalleryItemType;
  onSelect: (item: GalleryItemType) => void;
}

const TYPE_ICONS = {
  audio: Music,
  image: ImageIcon,
  video: Film,
};

const TYPE_BADGES = {
  audio: 'AUD',
  image: 'IMG',
  video: 'VID',
};

export const GalleryItem = memo(function GalleryItem({ item, onSelect }: GalleryItemProps) {
  const mediaUrl = `/api/gallery/${item.path}`;
  const Icon = TYPE_ICONS[item.type];

  return (
    <div
      onClick={() => onSelect(item)}
      className="group relative aspect-square rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-white transition-all duration-200"
    >
      {/* Thumbnail */}
      {item.type === 'image' && (
        <Image
          src={mediaUrl}
          alt={item.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
          className="object-cover"
          unoptimized
        />
      )}
      {item.type === 'video' && (
        <video src={mediaUrl} className="w-full h-full object-cover" muted preload="metadata" />
      )}
      {item.type === 'audio' && (
        <div className="w-full h-full flex items-center justify-center bg-[var(--secondary)]">
          <Music className="w-12 h-12 text-[var(--muted-foreground)]" />
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2">
        <Icon className="w-6 h-6 text-white mb-2" />
        <p className="text-xs text-white text-center truncate w-full px-2">{item.name}</p>
      </div>

      {/* Type badge */}
      <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase bg-black/50 text-white">
        {TYPE_BADGES[item.type]}
      </div>
    </div>
  );
});
