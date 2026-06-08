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
import type { KeyboardEvent } from 'react';
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
        <div className="absolute top-full mt-2 left-0 z-50 bg-card shadow-lg border border-white/[0.08] p-3 min-w-96 max-w-2xl">
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
            <div className="grid grid-cols-6 gap-2 max-h-72 overflow-y-auto">
              {availableIngredients.map((ingredient: IIngredient) => {
                const metadata = ingredient.metadata as IMetadata;

                return (
                  <div
                    key={ingredient.id}
                    role="button"
                    tabIndex={0}
                    className="relative group cursor-pointer transition-all"
                    onClick={() => onAddChild(ingredient.id)}
                    onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                      if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                      }

                      event.preventDefault();
                      onAddChild(ingredient.id);
                    }}
                    title={
                      metadata.label ||
                      `${ingredient.category} - ${ingredient.id.slice(0, 8)}`
                    }
                  >
                    <div className="relative size-16 overflow-hidden border-2 border-transparent hover:border-primary transition-all hover:scale-105">
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
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
