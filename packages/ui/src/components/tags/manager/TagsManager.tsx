'use client';

import { ButtonSize, ButtonVariant, TagCategory } from '@genfeedai/enums';
import { useAuthIdentity } from '@genfeedai/hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ITag } from '@genfeedai/interfaces';
import type { TagsManagerComponentProps } from '@genfeedai/props/content/tags-manager.props';
import { IngredientsService } from '@genfeedai/services/content/ingredients.service';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { THEME_COLORS } from '@ui-constants/theme.constant';
import { useState } from 'react';
import { HiPlus } from 'react-icons/hi2';
import TagPickerDropdown from './TagPickerDropdown';
import TagsList from './TagsList';

export default function TagsManager({
  ingredient,
  // ingredientCategory,
  onTagsChange,
  isReadOnly = false,
}: TagsManagerComponentProps) {
  const { isSignedIn } = useAuthIdentity();

  const getIngredientsService = useAuthedService((token: string) =>
    IngredientsService.getInstance(token),
  );

  const getTagsService = useAuthedService((token: string) =>
    TagsService.getInstance(token),
  );

  const [prevIngredientId, setPrevIngredientId] = useState(ingredient.id);
  const [tags, setTags] = useState<Array<ITag | string>>(ingredient.tags || []);
  const [isSaving, setIsSaving] = useState(false);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);

  if (prevIngredientId !== ingredient.id) {
    setPrevIngredientId(ingredient.id);
    setTags(ingredient.tags || []);
  }

  const {
    data: availableTags = [],
    isLoading,
    refetch: refreshAvailableTags,
  } = useQuery({
    queryKey: ['tags-manager-available', TagCategory.INGREDIENT],
    queryFn: async () => {
      const service = await getTagsService();
      return service.searchTags('', TagCategory.INGREDIENT);
    },
    enabled: !!isSignedIn,
  });

  const handleAddTag = async (tag: ITag) => {
    const tagExists = tags.some((t) => {
      if (typeof t === 'string') {
        return t === tag.id;
      }
      return t.id === tag.id;
    });

    if (tagExists || isSaving) {
      return;
    }

    const newTags = [...tags, tag];
    setTags(newTags);
    setShowTagPicker(false);

    await updateIngredientTags(newTags);
  };

  const handleCreateNewTag = async () => {
    if (!newTagLabel.trim() || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      const service = await getTagsService();
      const newTag = await service.addTagToEntity(
        TagCategory.INGREDIENT,
        ingredient.id,
        newTagLabel.trim(),
      );

      const newTags = [...tags, newTag];
      setTags(newTags);
      setNewTagLabel('');
      setShowNewTagInput(false);
      setShowTagPicker(false);

      // Refresh available tags list after creating new tag
      await refreshAvailableTags();
      await updateIngredientTags(newTags);
      setIsSaving(false);
    } catch (error) {
      logger.error('Failed to create new tag', error);
      setIsSaving(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    if (isSaving) {
      return;
    }

    const newTags = tags.filter((t) => {
      if (typeof t === 'string') {
        return t !== tagId;
      }
      return t.id !== tagId;
    });
    setTags(newTags);

    await updateIngredientTags(newTags);
  };

  const updateIngredientTags = async (newTags: Array<ITag | string>) => {
    setIsSaving(true);
    try {
      const service = await getIngredientsService();
      // Extract tag IDs from mixed array of ITag objects and string IDs
      const tagIds = newTags.map((t) => (typeof t === 'string' ? t : t.id));
      await service.patchTags(ingredient.id, tagIds);

      // Refresh the available tags list to get the latest state
      await refreshAvailableTags();

      onTagsChange?.(newTags);
      logger.info('Tags updated successfully');

      setIsSaving(false);
    } catch (error) {
      logger.error('Failed to update tags', error);

      // Revert on error
      setTags(ingredient.tags || []);
      setIsSaving(false);
    }
  };

  const getTagDisplay = (
    tag: ITag | string,
  ): {
    id: string;
    label: string;
    backgroundColor: string;
    textColor: string;
  } => {
    // If it's a Tag object, use its properties
    if (typeof tag === 'object' && tag && 'id' in tag) {
      return {
        backgroundColor: tag.backgroundColor || THEME_COLORS.PRIMARY,
        id: tag.id,
        label: tag.label || tag.id,
        textColor: tag.textColor || THEME_COLORS.SECONDARY,
      };
    }

    // If it's a string ID, try to find it in available tags
    const foundTag = availableTags.find((t) => t.id === (tag as string));
    if (foundTag) {
      return {
        backgroundColor: foundTag.backgroundColor || THEME_COLORS.PRIMARY,
        id: foundTag.id,
        label: foundTag.label,
        textColor: foundTag.textColor || THEME_COLORS.SECONDARY,
      };
    }

    // Fallback for string tags
    const tagString = typeof tag === 'string' ? tag : String(tag);
    return {
      backgroundColor: THEME_COLORS.PRIMARY,
      id: tagString,
      label: tagString,
      textColor: THEME_COLORS.SECONDARY,
    };
  };

  if (isLoading) {
    return <Loading isFullSize={false} />;
  }

  const tagDisplayItems = tags.map(getTagDisplay);

  return (
    <div className="flex flex-col gap-3">
      {/* Current Tags */}
      <TagsList
        tagDisplayItems={tagDisplayItems}
        isReadOnly={isReadOnly}
        isSaving={isSaving}
        onRemoveTag={handleRemoveTag}
      />

      {/* Add Tag Button */}
      {!isReadOnly && (
        <div className="relative">
          <Button
            label="Add Tag"
            icon={<HiPlus />}
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={() => setShowTagPicker(!showTagPicker)}
            isDisabled={isSaving}
          />

          {/* Tag Picker Dropdown */}
          {showTagPicker && (
            <TagPickerDropdown
              availableTags={availableTags}
              currentTags={tags}
              showNewTagInput={showNewTagInput}
              newTagLabel={newTagLabel}
              isSaving={isSaving}
              onAddTag={handleAddTag}
              onCreateNewTag={handleCreateNewTag}
              onNewTagLabelChange={setNewTagLabel}
              onShowNewTagInput={setShowNewTagInput}
              onClose={() => setShowTagPicker(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
