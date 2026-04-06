'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IIngredient } from '@genfeedai/interfaces';
import { resolveIngredientAspectRatio } from '@helpers/formatting/aspect-ratio/aspect-ratio.util';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useFindAll } from '@hooks/data/crud/use-crud/use-crud';
import type { CanvasGalleryProps } from '@props/studio/canvas-gallery.props';
import {
  type GallerySelectItem,
  useGalleryModal,
} from '@providers/global-modals/global-modals.provider';
import { IngredientsService } from '@services/content/ingredients.service';
import Button from '@ui/buttons/base/Button';
import { SCROLL_FOCUS_SURFACE_CLASS } from '@ui/styles/scroll-focus';
import { useEffect, useMemo, useRef, useState } from 'react';
import { HiPhoto, HiXMark } from 'react-icons/hi2';

const CATEGORY_TO_TYPE: Partial<Record<IngredientCategory, string>> = {
  [IngredientCategory.VIDEO]: 'videos',
  [IngredientCategory.IMAGE]: 'images',
  [IngredientCategory.MUSIC]: 'musics',
  [IngredientCategory.AVATAR]: 'avatars',
  [IngredientCategory.VOICE]: 'voices',
};

const EXCLUDED_STATUSES = new Set([
  IngredientStatus.ARCHIVED,
  IngredientStatus.PROCESSING,
]);

export default function CanvasGallery({
  categoryType,
  onAssetSelect,
  onReferencesSelect,
  selectedAssetId,
  scrollFocusedIngredientId,
  currentFormat,
  generatedAssetId,
}: CanvasGalleryProps): React.ReactElement | null {
  const { brandId } = useBrand();
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedReferenceImages, setSelectedReferenceImages] = useState<
    IIngredient[]
  >([]);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const { openGallery } = useGalleryModal();

  const typeString = CATEGORY_TO_TYPE[categoryType] ?? 'images';

  const query = useMemo(() => {
    const baseQuery: Record<string, string | number> = {
      limit: ITEMS_PER_PAGE * 2,
      page: 1,
      sort: 'createdAt: -1',
      type: typeString.slice(0, -1),
    };
    if (brandId) {
      baseQuery.brand = brandId;
    }
    if (currentFormat) {
      baseQuery.format = resolveIngredientAspectRatio({
        height: currentFormat.height,
        width: currentFormat.width,
      });
    }
    return baseQuery;
  }, [typeString, brandId, currentFormat]);

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(typeString, token),
  );

  const { data: rawIngredients = [], isLoading } = useFindAll<IIngredient>(
    getIngredientsService,
    query,
    {
      defaultValue: [] as IIngredient[],
      dependencies: [
        typeString,
        refreshKey,
        currentFormat?.width,
        currentFormat?.height,
        brandId,
      ],
      enabled: Boolean(typeString && brandId),
    },
  );

  const ingredients = useMemo(
    () =>
      rawIngredients.filter(
        (ingredient) => !EXCLUDED_STATUSES.has(ingredient.status),
      ),
    [rawIngredients],
  );

  useEffect(() => {
    if (generatedAssetId) {
      const timer = setTimeout(() => setRefreshKey((prev) => prev + 1), 200);
      return () => clearTimeout(timer);
    }
  }, [generatedAssetId]);

  useEffect(() => {
    if (generatedAssetId && ingredients.length > 0 && onAssetSelect) {
      const generated = ingredients.find((i) => i.id === generatedAssetId);
      if (generated) {
        onAssetSelect(generated);
      }
    }
  }, [generatedAssetId, ingredients, onAssetSelect]);

  useEffect(() => {
    if (!scrollFocusedIngredientId) {
      return;
    }

    itemRefs.current[scrollFocusedIngredientId]?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    });
  }, [scrollFocusedIngredientId]);

  function handleClick(ingredient: IIngredient): void {
    if (!onAssetSelect) {
      return;
    }
    const isDeselecting = selectedAssetId === ingredient.id;
    onAssetSelect(isDeselecting ? null : ingredient);
  }

  function handleOpenGalleryModal(): void {
    openGallery({
      category: IngredientCategory.IMAGE,
      format: resolveIngredientAspectRatio({
        height: currentFormat?.height,
        width: currentFormat?.width,
      }),
      onSelect: (selected: GallerySelectItem | GallerySelectItem[] | null) => {
        if (!selected) {
          setSelectedReferenceImages([]);
          onReferencesSelect?.([]);
          return;
        }
        const items = selected as unknown as IIngredient | IIngredient[];
        const references = Array.isArray(items) ? items : items ? [items] : [];
        setSelectedReferenceImages(references);
        onReferencesSelect?.(references);
      },
      title: 'Select Reference Images',
    });
  }

  function handleClearReferences(): void {
    setSelectedReferenceImages([]);
    onReferencesSelect?.([]);
  }

  const hasReferences = selectedReferenceImages.length > 0;
  const hasIngredients = ingredients.length > 0;

  if (isLoading && !hasIngredients) {
    return (
      <div className="absolute bottom-2 inset-x-0 flex justify-center">
        <div className="w-6 h-6 rounded-full bg-muted animate-pulse" />
      </div>
    );
  }

  if (!hasIngredients && !hasReferences) {
    return null;
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 bg-card/80 backdrop-blur p-2">
      <div className="flex gap-2 items-center">
        <Button
          label={<HiPhoto className="w-4 h-4" />}
          onClick={handleOpenGalleryModal}
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          tooltip="Select reference images"
          tooltipPosition="left"
        />

        {hasReferences && (
          <div className="flex gap-2 items-center">
            <div className="flex gap-2">
              {selectedReferenceImages.slice(0, 3).map((ref) => (
                <div
                  key={ref.id}
                  className="w-12 h-12 overflow-hidden border-2 border-primary"
                />
              ))}
            </div>
            <div className="flex gap-2 items-center px-2 py-1 bg-primary/10">
              <span className="text-xs text-primary font-medium">
                {selectedReferenceImages.length} reference
                {selectedReferenceImages.length !== 1 ? 's' : ''}
              </span>
              <Button
                label={<HiXMark className="w-4 h-4" />}
                onClick={handleClearReferences}
                variant={ButtonVariant.GHOST}
                size={ButtonSize.ICON}
                tooltip="Clear references"
                tooltipPosition="left"
              />
            </div>
          </div>
        )}

        {hasReferences && hasIngredients && (
          <div className="w-px h-8 bg-muted" />
        )}

        <div className="flex gap-2 overflow-x-auto flex-1">
          {ingredients.map((ingredient) => (
            <div
              key={ingredient.id}
              ref={(element) => {
                itemRefs.current[ingredient.id] = element;
              }}
              data-testid={`canvas-gallery-item-${ingredient.id}`}
              className={cn(
                'w-20 cursor-pointer overflow-hidden flex-shrink-0 rounded-xl transition-all duration-300',
                scrollFocusedIngredientId === ingredient.id &&
                  SCROLL_FOCUS_SURFACE_CLASS,
                selectedAssetId === ingredient.id && 'ring-2 ring-primary',
              )}
              onClick={() => handleClick(ingredient)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
