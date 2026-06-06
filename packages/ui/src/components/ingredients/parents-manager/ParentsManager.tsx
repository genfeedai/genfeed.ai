'use client';

import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import type { IngredientParentsManagerProps } from '@genfeedai/props/content/ingredient.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import Loading from '@ui/loading/default/Loading';
import { useCallback, useEffect, useState } from 'react';
import ParentsList from './ParentsList';
import ParentsPickerDropdown from './ParentsPickerDropdown';

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
      <ParentsPickerDropdown
        ingredientCategory={ingredient.category}
        isVideo={isVideo}
        isDisabled={isDisabled}
        isSearching={isSearching}
        isDropdownOpen={isDropdownOpen}
        availableIngredients={availableIngredients}
        onToggleDropdown={() => setIsDropdownOpen(!isDropdownOpen)}
        onAddParent={handleAddParent}
      />

      <ParentsList
        items={parents}
        ingredientCategory={ingredient.category}
        isVideo={isVideo}
        isDisabled={isDisabled}
        onRemoveParent={handleRemoveParent}
      />
    </div>
  );
}
