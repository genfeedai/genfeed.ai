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

type ChildrenPickerDropdownProps = {
  parentIngredientCategory: IngredientCategory;
  isVideo: boolean;
  isDisabled: boolean;
  isSearching: boolean;
  isSaving: boolean;
  isDropdownOpen: boolean;
  availableIngredients: IIngredient[];
  onToggleDropdown: () => void;
  onAddChild: (childId: string) => void;
};

export default function ChildrenPickerDropdown({
  parentIngredientCategory,
  isVideo,
  isDisabled,
  isSearching,
  isSaving,
  isDropdownOpen,
  availableIngredients,
  onToggleDropdown,
  onAddChild,
}: ChildrenPickerDropdownProps) {
  return (
    <div className="relative children-dropdown-container">
      <Button
        label={`Add child ${parentIngredientCategory}s`}
        onClick={onToggleDropdown}
        isDisabled={isDisabled || isSearching || isSaving}
        icon={isVideo ? <HiVideoCamera /> : <HiPhoto />}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
      />

      {isDropdownOpen && (
        <div className="absolute left-0 top-full z-50 mt-2 w-[min(32rem,calc(100vw-2rem))] bg-card p-3 shadow-dropdown">
          <div className="text-xs text-foreground/70 mb-2 font-medium">
            Select {parentIngredientCategory}s to add as children
          </div>

          {isSearching ? (
            <div className="flex items-center justify-center py-4">
              <span className="animate-spin size-4 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : availableIngredients.length === 0 ? (
            <div className="text-sm text-foreground/60 py-4 text-center">
              No available {parentIngredientCategory}s to add
            </div>
          ) : (
            <div className="grid max-h-72 grid-cols-[repeat(auto-fill,minmax(4rem,1fr))] gap-2 overflow-y-auto">
              {availableIngredients.map((ingredient: IIngredient) => {
                const metadata = ingredient.metadata as IMetadata;

                return (
                  <Button
                    key={ingredient.id}
                    className="group relative block cursor-pointer text-left focus-visible:outline-none"
                    onClick={() => onAddChild(ingredient.id)}
                    title={
                      metadata.label ||
                      `${ingredient.category} - ${ingredient.id.slice(0, 8)}`
                    }
                    type="button"
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                  >
                    <div className="relative size-16 overflow-hidden border-2 border-transparent transition-[border-color,transform] duration-200 group-hover:scale-105 group-hover:border-primary group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background">
                      {isVideo ? (
                        <div className="size-full bg-background">
                          <VideoPlayer
                            src={ingredient.ingredientUrl}
                            thumbnail={ingredient.thumbnailUrl}
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
                            ingredient.ingredientUrl ||
                            `${EnvironmentService.assetsEndpoint}/placeholders/portrait.jpg`
                          }
                          alt={metadata.label}
                          className="size-full object-cover"
                          width={64}
                          height={64}
                          sizes="64px"
                        />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-1">
                        <span className="text-white text-[9px] font-medium truncate px-1">
                          {metadata.label || ingredient.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
