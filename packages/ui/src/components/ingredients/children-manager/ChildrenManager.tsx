'use client';

import { IngredientCategory, IngredientStatus } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { IIngredient, IMetadata } from '@genfeedai/interfaces';
import type { IngredientChildrenManagerProps } from '@genfeedai/props/content/ingredient.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import Loading from '@ui/loading/default/Loading';
import { useCallback, useEffect, useState } from 'react';
import ChildrenList from './ChildrenList';
import ChildrenPickerDropdown from './ChildrenPickerDropdown';

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
      <ChildrenPickerDropdown
        parentIngredientCategory={parentIngredientCategory}
        isVideo={isVideo}
        isDisabled={isDisabled}
        isSearching={isSearching}
        isSaving={isSaving}
        isDropdownOpen={isDropdownOpen}
        availableIngredients={availableIngredients}
        onToggleDropdown={() => setIsDropdownOpen(!isDropdownOpen)}
        onAddChild={handleAddChild}
      />

      <ChildrenList
        items={children}
        parentIngredientCategory={parentIngredientCategory}
        isVideo={isVideo}
        isDisabled={isDisabled}
        isSaving={isSaving}
        onRemoveChild={handleRemoveChild}
      />
    </div>
  );
}
