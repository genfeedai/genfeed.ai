'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/enums';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { IngredientChildrenManagerProps } from '@props/content/ingredient.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { HiPhoto, HiVideoCamera, HiXMark } from 'react-icons/hi2';

export default function ChildrenManager({
  ingredient,
  onChildrenChange,
  isDisabled = false,
}: IngredientChildrenManagerProps) {
  const getIngredientsService = useAuthedService((token: string) => {
    return IngredientsService.getInstance(token);
  });

  const notificationsService = NotificationsService.getInstance();

  const [children, setChildren] = useState<IIngredient[]>([]);
  const [availableIngredients, setAvailableIngredients] = useState<
    IIngredient[]
  >([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const parentIngredientId = ingredient.id;
  const parentIngredientCategory = ingredient.category;
  const isVideo =
    parentIngredientCategory === IngredientCategory.VIDEO || false;

  const findAllChildren = useCallback(async () => {
    setIsLoading(true);
    try {
      const service = await getIngredientsService();
      // Get ingredients that have this ingredient as their parent
      const childIngredients = await service.findChildren(parentIngredientId);
      setChildren(childIngredients);
    } catch (error) {
      logger.error('Failed to load child ingredients', error);
    } finally {
      setIsLoading(false);
    }
  }, [getIngredientsService, parentIngredientId]);

  const findAllIngredients = useCallback(async () => {
    setIsSearching(true);
    try {
      const service = await getIngredientsService();
      const ingredients = await service.findAll({
        type: parentIngredientCategory,
        // parent: 'null', // I want to see all ingredients, parents and children. at least for now.
      });

      // Filter out current ingredient and already selected children
      const childIds = children.map((c) => c.id);
      const available = ingredients.filter(
        (ingredient: IIngredient) =>
          ingredient.id !== parentIngredientId &&
          !childIds.includes(ingredient.id) &&
          ingredient.status !== IngredientStatus.PROCESSING,
      );

      setAvailableIngredients(available);
    } catch (error) {
      logger.error('Failed to load available ingredients', error);
    } finally {
      setIsSearching(false);
    }
  }, [
    getIngredientsService,
    parentIngredientCategory,
    parentIngredientId,
    children,
  ]);

  useEffect(() => {
    findAllChildren();
    findAllIngredients();
  }, [findAllChildren, findAllIngredients]);

  const handleAddChild = async (childId: string) => {
    if (!childId || isDisabled || isSaving) {
      return;
    }

    const childIngredient = availableIngredients.find(
      (ingredient: IIngredient) => ingredient.id === childId,
    );
    if (!childIngredient) {
      return;
    }

    setIsSaving(true);
    try {
      const service = await getIngredientsService();
      // Update the selected ingredient to set this ingredient as its parent
      await service.patch(childId, { parent: parentIngredientId });

      // Update local state
      const updatedChildren = [...children, childIngredient];
      setChildren(updatedChildren);

      // Update available ingredients
      setAvailableIngredients((prev) =>
        prev.filter((ingredient: IIngredient) => ingredient.id !== childId),
      );
      setIsDropdownOpen(false);

      // Notify parent component
      const childIds = updatedChildren.map((c) => c.id);
      onChildrenChange?.(childIds);

      const metadata = childIngredient.metadata as IMetadata;

      notificationsService.success(
        `Added ${metadata.label || 'ingredient'} as child`,
      );
    } catch (error) {
      logger.error('Failed to add child ingredient', error);
      notificationsService.error('Failed to add child ingredient');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveChild = async (childId: string) => {
    if (isDisabled || isSaving) {
      return;
    }

    const removedChild = children.find((c) => c.id === childId);
    if (!removedChild) {
      return;
    }

    setIsSaving(true);
    try {
      const service = await getIngredientsService();
      // Remove parent from the child ingredient
      await service.patch(childId, { parent: 'null' });

      // Update local state
      const updatedChildren = children.filter((c) => c.id !== childId);
      setChildren(updatedChildren);

      // Add back to available ingredients
      if (removedChild.status !== IngredientStatus.PROCESSING) {
        setAvailableIngredients((prev) =>
          [...prev, removedChild].sort((a, b) => {
            const aMetadata = a.metadata as IMetadata;
            const bMetadata = b.metadata as IMetadata;
            return aMetadata.label.localeCompare(bMetadata.label);
          }),
        );
      }

      // Notify parent component
      const childIds = updatedChildren.map((c) => c.id);
      onChildrenChange?.(childIds);

      const metadata = removedChild.metadata as IMetadata;

      notificationsService.success(
        `Removed ${metadata.label || 'ingredient'} from children`,
      );
      setIsSaving(false);
    } catch (error) {
      logger.error('Failed to remove child ingredient', error);
      notificationsService.error('Failed to remove child ingredient');
      setIsSaving(false);
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.children-dropdown-container')) {
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
      <div className="relative children-dropdown-container">
        <Button
          label={`Add child ${parentIngredientCategory}s`}
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
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
                <span className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full" />
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
                      className="relative group cursor-pointer transition-all"
                      onClick={() => handleAddChild(ingredient.id)}
                      title={
                        metadata.label ||
                        `${ingredient.category} - ${ingredient.id.slice(0, 8)}`
                      }
                    >
                      <div className="relative w-16 h-16 overflow-hidden border-2 border-transparent hover:border-primary transition-all hover:scale-105">
                        {isVideo ? (
                          <div className="w-full h-full bg-background">
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
                            className="w-full h-full object-cover"
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

      {/* Selected children display */}
      {children.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {children.map((child: IIngredient) => {
            const metadata = child.metadata as IMetadata;
            return (
              <div key={child.id} className="relative group">
                <div className="relative w-20 h-20 overflow-hidden border-2 border-primary/30">
                  {isVideo ? (
                    <div className="w-full h-full bg-background">
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
                      className="w-full h-full object-cover"
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
                      onClick={() => handleRemoveChild(child.id)}
                      isDisabled={isSaving}
                      className="absolute top-1 right-1 bg-error text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-error-focus disabled:opacity-50"
                      ariaLabel="Remove child"
                    >
                      <HiXMark className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {children.length === 0 && (
        <p className="text-sm text-foreground/60">
          No child {parentIngredientCategory}s selected
        </p>
      )}
    </div>
  );
}
