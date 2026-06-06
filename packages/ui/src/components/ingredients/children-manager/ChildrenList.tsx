'use client';

import { ButtonVariant, type IngredientCategory } from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { HiXMark } from 'react-icons/hi2';

type ChildrenListProps = {
  items: IIngredient[];
  parentIngredientCategory: IngredientCategory;
  isVideo: boolean;
  isDisabled: boolean;
  isSaving: boolean;
  onRemoveChild: (childId: string) => void;
};

export default function ChildrenList({
  items,
  parentIngredientCategory,
  isVideo,
  isDisabled,
  isSaving,
  onRemoveChild,
}: ChildrenListProps) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-foreground/60">
        No child {parentIngredientCategory}s selected
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((child: IIngredient) => {
        const metadata = child.metadata as IMetadata;
        return (
          <div key={child.id} className="relative group">
            <div className="relative size-20 overflow-hidden border-2 border-primary/30">
              {isVideo ? (
                <div className="size-full bg-background">
                  <VideoPlayer
                    src={child.ingredientUrl}
                    config={{
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
                    child.ingredientUrl ||
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
                  {metadata.label || child.id.slice(0, 8)}
                </span>
              </div>

              {/* Remove button */}
              {!isDisabled && (
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={() => onRemoveChild(child.id)}
                  isDisabled={isSaving}
                  className="absolute top-1 right-1 bg-error text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error-focus disabled:opacity-50"
                  ariaLabel="Remove child"
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
