'use client';

import { useAuth } from '@clerk/nextjs';
import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  TagCategory,
} from '@genfeedai/enums';
import type { ITag } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { TagsManagerComponentProps } from '@props/content/tags-manager.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { TagsService } from '@services/content/tags.service';
import { logger } from '@services/core/logger.service';
import Badge from '@ui/display/badge/Badge';
import Loading from '@ui/loading/default/Loading';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { THEME_COLORS } from '@ui-constants/theme.constant';
import { useState } from 'react';
import { HiPlus, HiXMark } from 'react-icons/hi2';

export default function TagsManager({
  ingredient,
  // ingredientCategory,
  onTagsChange,
  isReadOnly = false,
}: TagsManagerComponentProps) {
  const { isSignedIn } = useAuth();

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

  // Load available tags using useResource (handles AbortController cleanup properly)
  const {
    data: availableTags,
    isLoading,
    refresh: refreshAvailableTags,
  } = useResource(
    async () => {
      const service = await getTagsService();
      return service.searchTags('', TagCategory.INGREDIENT);
    },
    {
      defaultValue: [] as ITag[],
      enabled: !!isSignedIn,
    },
  );

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

  return (
    <div className="flex flex-col gap-3">
      {/* Current Tags */}
      <div className="flex flex-wrap gap-2">
        {tags.length === 0 && !isReadOnly && (
          <span className="text-sm text-muted-foreground">No tags added</span>
        )}

        {tags.map((tag) => {
          const tagDisplay = getTagDisplay(tag);
          return (
            <Badge
              key={tagDisplay.id}
              backgroundColor={tagDisplay.backgroundColor}
              textColor={tagDisplay.textColor}
            >
              <span>{tagDisplay.label}</span>

              {!isReadOnly && (
                <Button
                  label={''}
                  icon={<HiXMark className="w-3 h-3" />}
                  onClick={() => handleRemoveTag(tagDisplay.id)}
                  isDisabled={isSaving}
                  className="hover:opacity-70 transition-opacity"
                />
              )}
            </Badge>
          );
        })}
      </div>

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
            <div className="absolute z-10 mt-1 w-64 bg-card shadow-lg border border-white/[0.08] p-2">
              <div className="text-sm font-semibold mb-2 px-2">
                Available Tags
              </div>

              {!showNewTagInput ? (
                <>
                  <div className="max-h-48 overflow-y-auto">
                    {(() => {
                      const unselectedTags = availableTags.filter((tag) => {
                        return !tags.some((t) =>
                          typeof t === 'string'
                            ? t === tag.id
                            : t.id === tag.id,
                        );
                      });

                      if (unselectedTags.length === 0) {
                        return (
                          <div className="text-sm text-muted-foreground px-2 py-1">
                            No available tags
                          </div>
                        );
                      }

                      return unselectedTags.map((tag) => (
                        <Button
                          key={tag.id}
                          withWrapper={false}
                          variant={ButtonVariant.UNSTYLED}
                          onClick={() => handleAddTag(tag)}
                          className="w-full text-left px-2 py-1.5 hover:bg-background transition-colors flex items-center gap-2"
                        >
                          <Badge
                            size={ComponentSize.SM}
                            backgroundColor={
                              tag.backgroundColor || THEME_COLORS.PRIMARY
                            }
                            textColor={tag.textColor || THEME_COLORS.SECONDARY}
                          >
                            {tag.label}
                          </Badge>
                        </Button>
                      ));
                    })()}
                  </div>

                  <div className="mt-2 pt-2 border-t border-white/[0.08]">
                    <Button
                      withWrapper={false}
                      variant={ButtonVariant.UNSTYLED}
                      onClick={() => setShowNewTagInput(true)}
                      className="w-full text-sm px-2 py-1 hover:bg-background text-primary"
                    >
                      + Create New Tag
                    </Button>
                  </div>
                </>
              ) : (
                <div className="p-2">
                  <Input
                    name="newTag"
                    type="text"
                    value={newTagLabel}
                    onChange={(e) => setNewTagLabel(e.target.value)}
                    placeholder="Enter tag label..."
                    className="input-sm mb-2"
                  />

                  <div className="flex gap-2">
                    <Button
                      label="Create"
                      variant={ButtonVariant.DEFAULT}
                      size={ButtonSize.SM}
                      className="flex-1"
                      onClick={handleCreateNewTag}
                      isDisabled={!newTagLabel.trim() || isSaving}
                      isLoading={isSaving}
                    />

                    <Button
                      label="Cancel"
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.SM}
                      className="flex-1"
                      onClick={() => {
                        setShowNewTagInput(false);
                        setNewTagLabel('');
                      }}
                    />
                  </div>
                </div>
              )}

              {!showNewTagInput && (
                <div className="mt-2 pt-2 border-t border-white/[0.08]">
                  <Button
                    withWrapper={false}
                    variant={ButtonVariant.UNSTYLED}
                    onClick={() => setShowTagPicker(false)}
                    className="w-full text-sm px-2 py-1 hover:bg-background"
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
