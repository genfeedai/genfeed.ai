'use client';

import type { StudioEditTopbarProps } from '@cloud/interfaces/studio/studio-edit-topbar.interface';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
} from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import type { ReactNode } from 'react';
import { HiChevronDown, HiPhoto, HiVideoCamera } from 'react-icons/hi2';

const CATEGORY_CONFIG: Partial<
  Record<
    IngredientCategory,
    { icon: typeof HiVideoCamera; label: string; plural: string }
  >
> = {
  [IngredientCategory.VIDEO]: {
    icon: HiVideoCamera,
    label: 'Video',
    plural: 'videos',
  },
  [IngredientCategory.IMAGE]: {
    icon: HiPhoto,
    label: 'Image',
    plural: 'images',
  },
};

const CATEGORY_OPTIONS = [
  IngredientCategory.IMAGE,
  IngredientCategory.VIDEO,
] as const;

export default function StudioEditTopbar({
  categoryType,
  onIngredientCategoryChange,
  isProcessing,
  assets,
  selectedIngredient,
  onAssetDeselect,
}: StudioEditTopbarProps): ReactNode {
  const currentCategory =
    CATEGORY_CONFIG[categoryType] ?? CATEGORY_CONFIG[IngredientCategory.IMAGE]!;
  const CurrentIcon = currentCategory.icon;

  return (
    <div className="flex-shrink-0 border-b border-white/[0.08] bg-card px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative group">
            <Button
              withWrapper={false}
              variant={ButtonVariant.SECONDARY}
              className="gap-2 normal-case"
              size={ButtonSize.SM}
              isDisabled={isProcessing}
            >
              <CurrentIcon className="h-4 w-4" />
              {currentCategory.label}
              <HiChevronDown className="h-3 w-3" />
            </Button>
            <ul className="absolute left-0 top-full mt-2 hidden group-hover:block p-2 shadow-lg bg-background border border-white/[0.08] w-32 z-10">
              {CATEGORY_OPTIONS.map((category) => {
                const config = CATEGORY_CONFIG[category]!;
                const Icon = config.icon;
                const isActive = categoryType === category;

                return (
                  <li key={category}>
                    <Button
                      withWrapper={false}
                      variant={ButtonVariant.GHOST}
                      onClick={() => onIngredientCategoryChange(category)}
                      className={`w-full justify-start ${isActive ? 'bg-primary/10 text-primary' : ''}`}
                    >
                      <Icon className="h-4 w-4" />
                      {config.label}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <div className="flex items-end justify-end gap-4">
          {!selectedIngredient && (
            <div className="text-sm text-foreground/60">
              {assets.length} {currentCategory.plural} available
            </div>
          )}

          {selectedIngredient && (
            <Button
              label="Clear"
              onClick={onAssetDeselect}
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
            />
          )}
        </div>
      </div>
    </div>
  );
}
