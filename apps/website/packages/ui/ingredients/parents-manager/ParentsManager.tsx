'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { IngredientParentsManagerProps } from '@props/content/ingredient.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import Button from '@ui/buttons/base/Button';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Loading from '@ui/loading/default/Loading';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { HiPhoto, HiVideoCamera, HiXMark } from 'react-icons/hi2';

export default function ParentsManager({
  ingredient,
  onParentsChange,
  isDisabled = false,
}: IngredientParentsManagerProps) {
  const getIngredientsService = useAuthedService((token: string) => {
    return IngredientsService.getInstance(token);
  });

  const [parents, setParents] = useState<IIngredient[]>([]);
  const [availableIngredients, setAvailableIngredients] = useState<
    IIngredient[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isVideo = ingredient.category === IngredientCategory.VIDEO || false;

  const findAllParents = useCallback(async () => {
    if (!ingredient.parent) {
      return;
    }

    setIsLoading(true);
    try {
      const service = await getIngredientsService();
      const parent = await service.findOne(ingredient.parent as string);

      setParents([parent]);
    } catch (error) {
      logger.error('Failed to load parent ingredients', error);
    } finally {
      setIsLoading(false);
    }
  }, [getIngredientsService, ingredient.parent]);

  const findAllIngredients = useCallback(async () => {
    setIsSearching(true);
    try {
      const service = await getIngredientsService();
      const ingredients = await service.findAll({
        type: ingredient.category,
      });

      // Filter out current ingredient, already selected parents, and processing items
      const parentIds = parents.map((p) => p.id);
      const available = ingredients.filter(
        (availableIngredient: IIngredient) =>
          availableIngredient.id !== ingredient.id &&
          !parentIds.includes(availableIngredient.id) &&
          availableIngredient.status !== IngredientStatus.PROCESSING,
      );

      setAvailableIngredients(available);
    } catch (error) {
      logger.error('Failed to load available ingredients', error);
    } finally {
      setIsSearching(false);
    }
  }, [getIngredientsService, ingredient.category, ingredient.id, parents]);

  useEffect(() => {
    if (ingredient.parent) {
      findAllParents();
    }

    findAllIngredients();
  }, [findAllIngredients, findAllParents, ingredient.parent]);

  const handleAddParent = (parentId: string) => {
    if (!parentId || isDisabled) {
      return;
    }

    const newParent = availableIngredients.find(
      (ing: IIngredient) => ing.id === parentId,
    );
    if (!newParent) {
      return;
    }

    const updatedParents = [...parents, newParent];
    setParents(updatedParents);

    // Update available ingredients
    setAvailableIngredients((prev) =>
      prev.filter((ing: IIngredient) => ing.id !== parentId),
    );

    setIsDropdownOpen(false);

    // Notify parent component
    const parentIds = updatedParents.map((p) => p.id);
    onParentsChange?.(parentIds);
  };

  const handleRemoveParent = async (parentId: string) => {
    if (isDisabled) {
      return;
    }

    const removedParent = parents.find((p) => p.id === parentId);
    const updatedParents = parents.filter((p) => p.id !== parentId);
    setParents(updatedParents);

    // Add back to available ingredients
    if (removedParent && removedParent.status !== IngredientStatus.PROCESSING) {
      setAvailableIngredients((prev) =>
        [...prev, removedParent].sort((a, b) => {
          const aMetadata = a.metadata as IMetadata;
          const bMetadata = b.metadata as IMetadata;
          return aMetadata.label.localeCompare(bMetadata.label);
        }),
      );
    }

    // Notify parent component
    const parentIds = updatedParents.map((p) => p.id);
    onParentsChange?.(parentIds);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.parents-dropdown-container')) {
        setIsDropdownOpen(false);
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  return (
    <div className="space-y-3">
      {/* Dropdown with image/video previews */}
      <div className="relative parents-dropdown-container">
        <Button
          label={`Select parent ${ingredient.category}s`}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          isDisabled={isDisabled || isSearching}
          icon={isVideo ? <HiVideoCamera /> : <HiPhoto />}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
        />

        {isDropdownOpen && (
          <div className="absolute top-full mt-2 left-0 z-50 bg-card shadow-lg border border-white/[0.08] p-3 min-w-96 max-w-2xl">
            <div className="text-xs text-foreground/70 mb-2 font-medium">
              Select Parent {ingredient.category}s
            </div>

            {isSearching ? (
              <div className="flex items-center justify-center py-4">
                <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : availableIngredients.length === 0 ? (
              <div className="text-sm text-foreground/60 py-4 text-center">
                No available {ingredient.category}s
              </div>
            ) : (
              <div className="grid grid-cols-6 gap-2 max-h-72 overflow-y-auto">
                {availableIngredients.map((ing: IIngredient) => (
                  <div
                    key={ing.id}
                    className="relative group cursor-pointer transition-all"
                    onClick={() => handleAddParent(ing.id)}
                    title={
                      (ing.metadata as IMetadata)?.label ||
                      `${ing.category} - ${ing.id.slice(0, 8)}`
                    }
                  >
                    <div className="relative w-16 h-16 overflow-hidden border-2 border-transparent hover:border-primary transition-all hover:scale-105">
                      {isVideo ? (
                        <div className="w-full h-full bg-background">
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
                          className="w-full h-full object-cover"
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
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected parents display */}
      {parents.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {parents.map((parent) => (
            <div key={parent.id} className="relative group">
              <div className="relative w-20 h-20 overflow-hidden border-2 border-primary/30">
                {isVideo ? (
                  <div className="w-full h-full bg-background">
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
                    alt={(parent.metadata as IMetadata)?.label}
                    className="w-full h-full object-cover"
                    width={80}
                    height={80}
                    sizes="80px"
                  />
                )}

                {/* Label overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1">
                  <span className="text-white text-[10px] font-medium truncate block">
                    {(parent.metadata as IMetadata)?.label ||
                      parent.id.slice(0, 8)}
                  </span>
                </div>

                {/* Remove button */}
                {!isDisabled && (
                  <Button
                    withWrapper={false}
                    variant={ButtonVariant.UNSTYLED}
                    onClick={() => handleRemoveParent(parent.id)}
                    className="absolute top-1 right-1 bg-error text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error-focus"
                    ariaLabel="Remove parent"
                  >
                    <HiXMark className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {parents.length === 0 && (
        <p className="text-sm text-foreground/60">
          No parent {ingredient.category}s selected
        </p>
      )}
    </div>
  );
}
