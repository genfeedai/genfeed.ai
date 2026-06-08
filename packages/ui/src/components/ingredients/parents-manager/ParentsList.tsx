'use client';

import { ButtonVariant, type IngredientCategory } from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { HiXMark } from 'react-icons/hi2';

type ParentsListProps = {
  items: IIngredient[];
  ingredientCategory: IngredientCategory;
  isVideo: boolean;
  isDisabled: boolean;
  onRemoveParent: (parentId: string) => void;
};

export default function ParentsList({
  items,
  ingredientCategory,
  isVideo,
  isDisabled,
  onRemoveParent,
}: ParentsListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        No parent {ingredientCategory}s selected
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((parent: IIngredient) => {
        const metadata = parent.metadata as IMetadata;
        return (
          <div key={parent.id} className="relative group">
            <div className="relative size-20 overflow-hidden border-2 border-primary/30">
              {isVideo ? (
                <div className="size-full bg-background">
                  <VideoPlayer
                    src={parent.ingredientUrl}
                    thumbnail={parent.thumbnailUrl}
                    config={{
                      autoPlay: false,
                      controls: false,
                      loop: true,
                      muted: true,
                      playsInline: true,
                      preload: 'metadata',
                    }}
                  />
                </div>
              ) : (
                <Image
                  src={
                    parent.ingredientUrl ||
                    `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
                  }
                  alt={metadata.label}
                  className="size-full object-cover"
                  width={80}
                  height={80}
                  sizes="80px"
                />
              )}

              {/* Label overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                <span className="text-white text-[10px] font-medium truncate block">
                  {metadata.label || parent.id.slice(0, 8)}
                </span>
              </div>

              {/* Remove button */}
              {!isDisabled && (
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={() => onRemoveParent(parent.id)}
                  className="absolute top-1 right-1 bg-error text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error-focus"
                  ariaLabel="Remove parent"
                >
                  <HiXMark className="size-3" />
                </Button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
