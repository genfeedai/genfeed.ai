'use client';

import type { IMetadata } from '@genfeedai/interfaces';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { formatDuration } from '@genfeedai/helpers';
import type { ModalGalleryItemMusicProps } from '@props/modals/modal-gallery.props';
import { EnvironmentService } from '@services/core/environment.service';
import Button from '@ui/buttons/base/Button';
import { HiMusicalNote, HiPause, HiPlay } from 'react-icons/hi2';

export default function ModalGalleryItemMusic({
  music,
  isSelected,
  isPlaying,
  onSelect,
  onPlayPause,
}: ModalGalleryItemMusicProps) {
  const metadata =
    typeof music.metadata === 'object' && music.metadata
      ? (music.metadata as IMetadata)
      : null;
  const metadataLabel = metadata?.label;

  return (
    <div
      key={music.id}
      onClick={() => onSelect(music)}
      className={`relative p-4 border-2 transition-all cursor-pointer group ${
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-white/[0.08] hover:border-primary/50 bg-background'
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center ${
            isSelected ? 'bg-primary/20' : 'bg-muted'
          }`}
        >
          <HiMusicalNote
            className={`text-xl ${
              isSelected ? 'text-primary' : 'text-foreground/50'
            }`}
          />
        </div>

        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">
            {metadataLabel || 'Untitled'}
          </h4>

          {music.metadataDuration && (
            <p className="text-xs text-foreground/60">
              {formatDuration(music.metadataDuration)}
            </p>
          )}
        </div>

        <Button
          label={isPlaying ? <HiPause /> : <HiPlay />}
          onClick={(e) => {
            e.stopPropagation();

            const musicUrl =
              music.ingredientUrl ||
              `${EnvironmentService.ingredientsEndpoint}/musics/${music.id}`;
            onPlayPause(music.id, musicUrl);
          }}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.ICON}
          className="rounded-full"
        />
      </div>

      {isSelected && (
        <div className="absolute top-2 right-2">
          <div className="w-2 h-2 bg-primary rounded-full" />
        </div>
      )}
    </div>
  );
}
