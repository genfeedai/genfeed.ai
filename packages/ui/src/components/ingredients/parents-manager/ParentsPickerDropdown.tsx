'use client';

import {
  ButtonSize,
  ButtonVariant,
  type IngredientCategory,
} from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { HiPhoto, HiVideoCamera } from 'react-icons/hi2';

type ParentsPickerDropdownProps = {
  ingredientCategory: IngredientCategory;
  isVideo: boolean;
  isDisabled: boolean;
  isSearching: boolean;
  isDropdownOpen: boolean;
  availableIngredients: IIngredient[];
  onToggleDropdown: () => void;
  onAddParent: (parentId: string) => void;
};

export default function ParentsPickerDropdown({
  ingredientCategory,
  isVideo,
  isDisabled,
  isSearching,
  isDropdownOpen,
  availableIngredients,
  onToggleDropdown,
  onAddParent,
}: ParentsPickerDropdownProps) {
  return (
    <div className="relative parents-dropdown-container">
      <Button
        label={`Select parent ${ingredientCategory}s`}
        onClick={onToggleDropdown}
        isDisabled={isDisabled || isSearching}
        icon={isVideo ? <HiVideoCamera /> : <HiPhoto />}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
      />

      {isDropdownOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(32rem,calc(100vw-2rem))] bg-card p-3 shadow-dropdown">
          <div className="text-xs text-foreground/70 mb-2 font-medium">
            Select Parent {ingredientCategory}s
          </div>

          {isSearching ? (
            <div className="flex items-center justify-center py-4">
              <span className="animate-spin size-4 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : availableIngredients.length === 0 ? (
            <div className="text-sm text-foreground/60 py-4 text-center">
              No available {ingredientCategory}s
            </div>
          ) : (
            <div className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-2 overflow-y-auto">
              {availableIngredients.map((ing: IIngredient) => (
                <Button
                  key={ing.id}
                  className="group relative block cursor-pointer text-left focus-visible:outline-none"
                  onClick={() => onAddParent(ing.id)}
                  title={
                    (ing.metadata as IMetadata)?.label ||
                    `${ing.category} - ${ing.id.slice(0, 8)}`
                  }
                  type="button"
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                >
                  <div className="relative size-16 overflow-hidden border-2 border-transparent transition-[border-color,transform] duration-200 group-hover:scale-105 group-hover:border-primary group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background">
                    {isVideo ? (
                      <div className="size-full bg-background">
                        <VideoPlayer
                          src={ing.ingredientUrl}
                          thumbnail={ing.thumbnailUrl}
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
                          ing.ingredientUrl ||
                          `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
                        }
                        alt={(ing.metadata as IMetadata)?.label}
                        className="size-full object-cover"
                        width={64}
                        height={64}
                        sizes="64px"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1">
                      <span className="text-white text-[9px] font-medium truncate px-1">
                        {(ing.metadata as IMetadata)?.label ||
                          ing.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
