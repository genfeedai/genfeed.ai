'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  DropdownDirection,
  TagCategory,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ITag } from '@genfeedai/interfaces';
import type { DropdownTagsProps } from '@genfeedai/props/tags/dropdown-tags.props';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import TagBadge from '@ui/tags/badge/TagBadge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiCheck, HiHashtag, HiPlus } from 'react-icons/hi2';

export default function DropdownTags({
  selectedTags,
  onChange,
  scope,
  className,
  placeholder = 'Tags',
  direction = DropdownDirection.DOWN,
  isDisabled = false,
  showLabel = true,
  externalTags,
  isLoadingTags = false,
}: DropdownTagsProps) {
  const { brandId } = useBrand();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allTags, setAllTags] = useState<ITag[]>(externalTags || []);

  // Don't show loading state if external tags are provided
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    left: 0,
    right: 0,
    top: 0,
    useRight: false,
  });

  const getTagsService = useAuthedService((token: string) =>
    TagsService.getInstance(token),
  );
  const notificationsService = NotificationsService.getInstance();
  const hasLoadedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  const previousCacheKeyRef = useRef<string | null>(null);

  // Update allTags when externalTags change (only if valid and different)
  useEffect(() => {
    // Only update if externalTags is provided and is a valid array
    if (
      externalTags &&
      Array.isArray(externalTags) &&
      externalTags.length >= 0
    ) {
      // Cancel any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }

      // Only update if component is still mounted
      if (isMountedRef.current) {
        setAllTags(externalTags);
        setIsLoading(false);
        hasLoadedRef.current = true;
      }
    } else if (externalTags === undefined || externalTags === null) {
      // Reset hasLoadedRef when externalTags is cleared to allow reloading
      hasLoadedRef.current = false;
    }
  }, [externalTags]);

  // Load tags when dropdown opens (only if no external tags provided)
  useEffect(() => {
    // Skip if external tags are provided
    if (externalTags) {
      return;
    }

    // Skip if not open
    if (!isOpen) {
      return;
    }

    // Create cache key from scope and brandId combination
    const currentCacheKey = `${scope ?? 'no-scope'}-${brandId ?? 'no-brand'}`;

    // Reset loaded flag if scope/brandId combination changed
    if (
      previousCacheKeyRef.current !== null &&
      previousCacheKeyRef.current !== currentCacheKey
    ) {
      hasLoadedRef.current = false;
    }

    // Update cache key
    previousCacheKeyRef.current = currentCacheKey;

    // Skip if already loaded for this cache key
    if (hasLoadedRef.current) {
      return;
    }

    // Cancel any previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Load tags internally
    const loadTags = async () => {
      setIsLoading(true);

      const url = `GET /tags ${scope ? `?category=${scope}` : ''}`;
      try {
        const service = await getTagsService();
        const params: any = {
          category: scope,
        };

        if (brandId) {
          params.brand = brandId;
        }

        const tags = await service.findAll(params);

        // Only update state if component is still mounted
        if (!isMountedRef.current) {
          return;
        }

        // Skip data update if this request was superseded (controller aborted)
        // but always clear loading state for mounted component
        if (controller.signal.aborted) {
          setIsLoading(false);
          return;
        }

        logger.info(`${url} success`, tags);
        setAllTags(tags as ITag[]);
        setIsLoading(false);
        hasLoadedRef.current = true;
      } catch (error) {
        // Don't update state if component unmounted
        if (!isMountedRef.current) {
          return;
        }

        // Always clear loading state for mounted component
        setIsLoading(false);

        // Skip error handling if request was superseded (controller aborted)
        // This includes Axios cancel errors (CanceledError) and any other errors
        // from aborted requests - a new request is already in progress
        if (controller.signal.aborted) {
          return;
        }

        logger.error(`${url} failed`, error);
        notificationsService.error('Failed to load tags');
      } finally {
        // Clear abort controller reference if this was the active request
        if (abortControllerRef.current === controller) {
          abortControllerRef.current = null;
        }
      }
    };

    loadTags();

    // Cleanup: abort request if effect re-runs or component unmounts
    return () => {
      if (abortControllerRef.current === controller) {
        controller.abort();
        abortControllerRef.current = null;
      }
    };
  }, [
    isOpen,
    externalTags,
    scope,
    brandId,
    getTagsService,
    notificationsService.error,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;

      // Dropdown width is 320px (w-80 = 20rem)
      const dropdownWidth = 320;
      const viewportWidth = window.innerWidth;

      // Check if dropdown would go off-screen to the right
      const wouldOverflowRight = rect.left + dropdownWidth > viewportWidth;

      // Calculate right position (distance from right edge of viewport)
      const rightPosition = viewportWidth - (rect.right + scrollX);

      setDropdownPosition({
        left: rect.left + scrollX,
        right: rightPosition,
        top: rect.top + scrollY,
        useRight: wouldOverflowRight,
      });
    }
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Filter tags by search query
  const filteredTags = useMemo(() => {
    if (!searchQuery) {
      return allTags;
    }
    const query = searchQuery.toLowerCase();
    return allTags.filter((tag) => tag.label.toLowerCase().includes(query));
  }, [allTags, searchQuery]);

  // Create a Set of selected tag IDs for faster lookups and proper re-rendering
  const selectedTagIds = useMemo(() => new Set(selectedTags), [selectedTags]);

  // Get selected tag objects
  const selectedTagObjects = useMemo(() => {
    return allTags.filter((tag) => tag.id && selectedTagIds.has(tag.id));
  }, [allTags, selectedTagIds]);

  // Check if a tag is selected
  const isTagSelected = (tagId: string) => selectedTagIds.has(tagId);

  // Toggle tag selection
  const toggleTag = (tagId: string) => {
    if (isTagSelected(tagId)) {
      onChange(selectedTags.filter((id: string) => id !== tagId));
    } else {
      onChange([...selectedTags, tagId]);
    }
  };

  // Create new tag
  const handleCreateTag = async () => {
    if (!searchQuery.trim()) {
      return;
    }

    setIsCreating(true);
    try {
      const service = await getTagsService();

      // Map media categories (image, video, etc.) to 'Ingredient' category
      // Only use scope directly if it's a valid TagCategory
      let category: TagCategory | undefined;
      if (scope) {
        // If scope is a media category (image, video, music, voice), use Ingredient
        category = TagCategory.INGREDIENT;
      }

      const newTag = await service.post({
        category,
        label: searchQuery.trim(),
      });

      if (newTag.id) {
        onChange([...selectedTags, newTag.id]);
        setAllTags((prev) => [...prev, newTag]);
        setSearchQuery('');

        notificationsService.success(`Tag "${newTag.label}" created`);
      }
    } catch (error) {
      logger.error('Failed to create tag', error);
      notificationsService.error('Failed to create tag');
    } finally {
      setIsCreating(false);
    }
  };

  // Remove tag from selection
  const handleRemoveTag = (tagId: string) => {
    onChange(selectedTags.filter((id) => id !== tagId));
  };

  // Check if we should show "Create" option
  const showCreateOption =
    searchQuery.trim() &&
    !filteredTags.some(
      (tag) => tag.label.toLowerCase() === searchQuery.toLowerCase(),
    );

  // Render dropdown menu via portal
  const renderDropdown = () => {
    if (!isOpen || typeof window === 'undefined') {
      return null;
    }

    return createPortal(
      <div
        ref={dropdownRef}
        style={{
          position: 'absolute',
          top:
            direction === 'up'
              ? `${dropdownPosition.top - 8}px`
              : `${dropdownPosition.top + (buttonRef.current?.offsetHeight || 0) + 8}px`,
          ...(dropdownPosition.useRight
            ? { right: `${dropdownPosition.right}px` }
            : { left: `${dropdownPosition.left}px` }),
          transform: direction === 'up' ? 'translateY(-100%)' : 'none',
          zIndex: 9999,
        }}
        className={cn(
          'w-80 rounded-lg bg-card border border-white/[0.08] shadow-lg',
        )}
      >
        {/* Search Input */}
        <div className="p-3 border-b border-white/[0.08]">
          <Input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search or create tags..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && showCreateOption) {
                handleCreateTag();
              }
            }}
          />
        </div>

        {/* Selected Tags */}
        {selectedTagObjects.length > 0 && (
          <div className="p-3 border-b border-white/[0.08]">
            <div className="text-xs uppercase text-foreground/60 mb-2">
              Selected ({selectedTagObjects.length})
            </div>

            <div className="flex flex-wrap gap-2">
              {selectedTagObjects.map((tag) => (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  isRemovable
                  onRemove={handleRemoveTag}
                />
              ))}
            </div>
          </div>
        )}

        {/* Tag List */}
        <div className="max-h-64 overflow-y-auto">
          {isLoading || isLoadingTags ? (
            <div className="p-4 text-center text-sm text-foreground/60">
              Loading tags...
            </div>
          ) : filteredTags.length === 0 && !showCreateOption ? (
            <div className="p-4 text-center text-sm text-foreground/60">
              No tags found
            </div>
          ) : (
            <>
              {/* Create New Tag Option */}
              {showCreateOption && (
                <Button
                  withWrapper={false}
                  variant={ButtonVariant.UNSTYLED}
                  onClick={handleCreateTag}
                  isDisabled={isCreating}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background transition-colors"
                >
                  <HiPlus className="w-4 h-4 text-primary" />
                  <span className="flex-1 text-left">
                    Create <strong>&quot;{searchQuery}&quot;</strong>
                  </span>
                </Button>
              )}

              {/* Existing Tags */}
              {filteredTags.map((tag) => {
                const selected = tag.id ? isTagSelected(tag.id) : false;

                return (
                  <Button
                    key={tag.id}
                    withWrapper={false}
                    variant={ButtonVariant.UNSTYLED}
                    onClick={() => tag.id && toggleTag(tag.id)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-background transition-colors',
                      selected && 'bg-primary/10',
                    )}
                  >
                    <div
                      className={cn(
                        'flex-shrink-0 w-4 h-4 border-2 flex items-center justify-center',
                        selected
                          ? 'bg-primary border-primary'
                          : 'border-white/[0.08]',
                      )}
                    >
                      {selected && <HiCheck className="w-3 h-3 text-white" />}
                    </div>

                    <span className="flex-1 text-left truncate">
                      {tag.label}
                    </span>

                    {tag.description && (
                      <span className="text-xs text-foreground/60 truncate max-w-56">
                        {tag.description}
                      </span>
                    )}
                  </Button>
                );
              })}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-2 border-t border-white/[0.08] flex items-center justify-between">
          <div className="text-xs text-foreground/60">
            {selectedTags.length} selected
          </div>

          <Button
            withWrapper={false}
            variant={ButtonVariant.UNSTYLED}
            onClick={() => {
              setIsOpen(false);
              setSearchQuery('');
            }}
            className="h-6 px-2 text-xs hover:bg-accent hover:text-accent-foreground"
          >
            Done
          </Button>
        </div>
      </div>,
      document.body,
    );
  };

  const hasSelectedTags = selectedTags.length > 0;
  const tagCountLabel = hasSelectedTags
    ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''}`
    : placeholder;

  const renderButtonContent = () => {
    if (showLabel) {
      return <span>{tagCountLabel}</span>;
    }
    if (hasSelectedTags) {
      return (
        <span className="absolute -top-0.5 -right-0.5 min-w-fit h-5 flex items-center justify-center px-1 text-[10px] font-bold text-white bg-orange-500 rounded-full border-2 border-white/20 shadow-lg z-10">
          {selectedTags.length}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="relative">
      {/* Trigger Button */}
      <Button
        ref={buttonRef}
        withWrapper={false}
        variant={ButtonVariant.UNSTYLED}
        onClick={() => !isDisabled && setIsOpen(!isOpen)}
        isDisabled={isDisabled}
        tooltip="Tags"
        tooltipPosition="top"
        ariaLabel="Manage tags"
        className={cn(
          'h-8 rounded-lg px-2 hover:bg-accent normal-case flex items-center gap-2 hover:bg-background',
          hasSelectedTags ? 'text-foreground' : 'text-foreground/70',
          className,
          isDisabled && 'opacity-50 cursor-not-allowed',
          !showLabel && hasSelectedTags && 'relative',
        )}
      >
        <HiHashtag className="w-4 h-4" />
        {renderButtonContent()}
      </Button>

      {/* Dropdown Menu rendered via portal */}
      {renderDropdown()}
    </div>
  );
}
