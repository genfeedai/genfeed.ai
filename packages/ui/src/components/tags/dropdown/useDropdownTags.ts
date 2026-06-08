import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { TagCategory } from '@genfeedai/enums';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import type { ITag } from '@genfeedai/interfaces';
import type { DropdownTagsProps } from '@genfeedai/props/tags/dropdown-tags.props';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useEffect, useMemo, useRef, useState } from 'react';

type DropdownTagsHookParams = Pick<
  DropdownTagsProps,
  | 'selectedTags'
  | 'onChange'
  | 'scope'
  | 'placeholder'
  | 'externalTags'
  | 'isLoadingTags'
>;

export function useDropdownTags({
  selectedTags,
  onChange,
  scope,
  placeholder = 'Tags',
  externalTags,
}: DropdownTagsHookParams) {
  const { brandId } = useBrand();
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allTags, setAllTags] = useState<ITag[]>(externalTags || []);

  // Don't show loading state if external tags are provided
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
        // Only update state if component is still mounted
        if (!isMountedRef.current) {
          return;
        }

        const service = await getTagsService();
        const params: Record<string, string | undefined> = {
          category: scope,
        };

        if (brandId) {
          params.brand = brandId;
        }

        const tags = await service.findAll(params);

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
    const mountedRef = isMountedRef;
    return () => {
      mountedRef.current = false;
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
    searchQuery.trim() !== '' &&
    !filteredTags.some(
      (tag) => tag.label.toLowerCase() === searchQuery.toLowerCase(),
    );

  const hasSelectedTags = selectedTags.length > 0;
  const tagCountLabel = hasSelectedTags
    ? `${selectedTags.length} tag${selectedTags.length > 1 ? 's' : ''}`
    : placeholder;

  const handleClose = () => {
    setIsOpen(false);
    setSearchQuery('');
  };

  return {
    isOpen,
    setIsOpen,
    searchQuery,
    setSearchQuery,
    isLoading,
    isCreating,
    buttonRef,
    dropdownRef,
    searchInputRef,
    dropdownPosition,
    filteredTags,
    selectedTagObjects,
    isTagSelected,
    toggleTag,
    handleCreateTag,
    handleRemoveTag,
    showCreateOption,
    hasSelectedTags,
    tagCountLabel,
    handleClose,
  };
}
