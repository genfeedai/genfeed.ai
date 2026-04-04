'use client';

import { useAuth } from '@clerk/nextjs';
import type { ITag } from '@genfeedai/interfaces';
import { ButtonVariant, ComponentSize } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import type { ExtendedIngredientTabsTagsProps } from '@props/content/ingredient-tabs.props';
import { IngredientsService } from '@services/content/ingredients.service';
import { TagsService } from '@services/content/tags.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import TagsManager from '@ui/tags/manager/TagsManager';
import { IngredientEndpoints } from '@utils/media/ingredients.util';
import { useMemo, useState } from 'react';
import { HiPlus, HiTag, HiXMark } from 'react-icons/hi2';

export default function IngredientTabsTags({
  ingredient,
  onTagsUpdate,
}: ExtendedIngredientTabsTagsProps) {
  const { isSignedIn } = useAuth();
  const [tags, setTags] = useState<ITag[]>(ingredient.tags || []);
  const [isUpdating, setIsUpdating] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [isCreatingTag, setIsCreatingTag] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getTagsService = useAuthedService((token) =>
    TagsService.getInstance(token),
  );

  const getIngredientsService = useAuthedService((token) => {
    return IngredientsService.getInstance(token);
  });

  // Load available tags using useResource (handles AbortController cleanup properly)
  const { data: allTags, isLoading } = useResource(
    async () => {
      const service = await getTagsService();
      return service.findAll();
    },
    {
      defaultValue: [] as ITag[],
      dependencies: [tags],
      enabled: !!isSignedIn,
    },
  );

  // Filter out already assigned tags
  const availableTags = useMemo(() => {
    const currentTagIds = tags.map((t) => t.id);
    return allTags.filter((t) => !currentTagIds.includes(t.id));
  }, [allTags, tags]);

  const handleAddTag = async (tag: ITag) => {
    setIsUpdating(true);
    try {
      const service = await getIngredientsService();
      const updatedTags = [...tags, tag];

      await service.patch(ingredient.id, {
        tags: updatedTags.map((t: ITag) => t.id as any),
      });

      setTags(updatedTags);
      // availableTags is derived from allTags via useMemo, no manual update needed

      onTagsUpdate?.(updatedTags);
      notificationsService.success(`Tag "${tag.label}" added`);
      setIsUpdating(false);
    } catch (error) {
      logger.error('Failed to add tag', error);
      notificationsService.error('Failed to add tag');
      setIsUpdating(false);
    }
  };

  const handleRemoveTag = async (tagId: string) => {
    setIsUpdating(true);
    try {
      const service = await getIngredientsService();
      const updatedTags = tags.filter((t) => t.id !== tagId);

      await service.patch(ingredient.id, {
        tags: updatedTags.map((t: ITag) => t.id as any),
      });

      setTags(updatedTags);
      // availableTags is derived from allTags via useMemo, no manual update needed

      onTagsUpdate?.(updatedTags);
      notificationsService.success('Tag removed');
      setIsUpdating(false);
    } catch (error) {
      logger.error('Failed to remove tag', error);
      notificationsService.error('Failed to remove tag');
      setIsUpdating(false);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) {
      return;
    }

    setIsCreatingTag(true);
    try {
      const service = await getTagsService();
      const tag: ITag = await service.post({
        label: newTagName.trim(),
      });

      // Add the new tag immediately
      await handleAddTag(tag);
      setNewTagName('');

      notificationsService.success(`Tag "${tag.label}" created and added`);
      setIsCreatingTag(false);
    } catch (error) {
      logger.error('Failed to create tag', error);
      notificationsService.error('Failed to create tag');
      setIsCreatingTag(false);
    }
  };

  const filteredAvailableTags = availableTags.filter((tag) =>
    tag.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {/* Current Tags */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Current Tags</h3>

        {tags.length === 0 ? (
          <p className="text-muted-foreground text-center py-4">
            No tags assigned
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge
                key={tag.id}
                size={ComponentSize.LG}
                className="gap-2 px-3 py-2"
                backgroundColor={tag.backgroundColor || '#e5e7eb'}
                textColor={tag.textColor || '#374151'}
              >
                <HiTag className="text-sm" />
                <span>{tag.label}</span>
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={() => handleRemoveTag(tag.id)}
                  isDisabled={isUpdating}
                  className="ml-1 hover:opacity-70 transition-opacity"
                  ariaLabel={`Remove tag ${tag.label}`}
                >
                  <HiXMark className="text-sm" />
                </Button>
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* TagsManager - Moved below the information */}
      <TagsManager
        isReadOnly={isUpdating}
        ingredient={ingredient}
        ingredientCategory={IngredientEndpoints.getEndpointFromTypeOrPath(
          ingredient.category,
        )}
        onTagsChange={(updatedTags: Array<ITag | string>) => {
          // Update local state to reflect the changes
          setTags(updatedTags as ITag[]);
          onTagsUpdate?.(updatedTags as ITag[]);
        }}
      />

      {/* Add Tags Section */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Add Tags</h3>

        {/* Create New Tag */}
        <div className="mb-4">
          <label className="text-sm font-medium mb-1 block">
            Create New Tag
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Enter tag name..."
              className="h-10 border border-input px-3 flex-1"
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
              disabled={isCreatingTag}
            />

            <Button
              label={isCreatingTag ? 'Creating...' : 'Create'}
              onClick={handleCreateTag}
              isLoading={isCreatingTag}
              isDisabled={!newTagName.trim()}
              variant={ButtonVariant.DEFAULT}
              icon={<HiPlus className="text-lg" />}
            />
          </div>
        </div>

        <div className="flex items-center gap-4 my-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm text-foreground/60">OR</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        {/* Search Existing Tags */}
        <div>
          <label className="text-sm font-medium mb-1 block">
            Select Existing Tags
          </label>
          <input
            type="text"
            placeholder="Search tags..."
            className="h-10 border border-input px-3 w-full mb-3"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="max-h-64 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-4">
                <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></span>
              </div>
            ) : filteredAvailableTags.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                {searchQuery ? 'No matching tags found' : 'No available tags'}
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {filteredAvailableTags.map((tag) => (
                  <Button
                    key={tag.id}
                    withWrapper={false}
                    variant={ButtonVariant.UNSTYLED}
                    onClick={() => handleAddTag(tag)}
                    isDisabled={isUpdating}
                    className="inline-flex items-center justify-start gap-2 px-3 h-8 text-sm bg-secondary text-secondary-foreground border"
                    style={{
                      borderColor: tag.backgroundColor || '#e5e7eb',
                      color: tag.textColor || '#374151',
                    }}
                    ariaLabel={`Add tag ${tag.label}`}
                  >
                    <HiTag className="text-sm" />
                    <span className="truncate">{tag.label}</span>
                    <HiPlus className="text-sm ml-auto" />
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Tag Statistics */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Tag Statistics</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-background">
            <div className="text-sm text-foreground/60">Total Tags</div>
            <div className="text-2xl font-bold">{tags.length}</div>
          </div>
          <div className="p-4 bg-background">
            <div className="text-sm text-foreground/60">Available</div>
            <div className="text-2xl font-bold">{availableTags.length}</div>
          </div>

          <div className="p-4 bg-background">
            <div className="text-sm text-foreground/60">Categories</div>
            <div className="text-2xl font-bold">
              {new Set(tags.map((t) => t.category)).size}
            </div>
          </div>
          <div className="p-4 bg-background">
            <div className="text-sm text-foreground/60">Most Used</div>
            <div className="text-lg font-bold">{tags[0]?.label || 'N/A'}</div>
          </div>
        </div>
      </Card>
    </div>
  );
}
