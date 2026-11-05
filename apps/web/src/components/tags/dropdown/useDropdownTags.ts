import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { TagCategory } from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
import { TagsService } from '@genfeedai/services/content/tags.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DropdownTagsProps } from '@/props/tags/dropdown-tags.props';

type DropdownTagsHookParams = Pick<
  DropdownTagsProps,
  | 'selectedTags'
  | 'onChange'
  | 'scope'
  | 'placeholder'
  | 'externalTags'
  | 'isLoadingTags'
>;

const EMPTY_TAGS: ITag[] = [];

function dropdownTagsQueryKey(
  scope: DropdownTagsProps['scope'],
  brandId: string | undefined,
) {
  return ['dropdown-tags', scope ?? null, brandId ?? null] as const;
}

function createTagsService(token: string): TagsService {
  return TagsService.getInstance(token);
}

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

  const queryClient = useQueryClient();
  const getTagsService = useAuthedService(createTagsService);
  const notificationsService = NotificationsService.getInstance();

  // The tags read through React Query the first time the dropdown opens (when
  // no external tags are given), so reopening it, here or on another page,
  // paints the cached tags at once and refreshes them in the background.
  const tagsQuery = useAuthedQuery<TagsService, ITag[]>({
    enabled: isOpen && !externalTags,
    queryFn: (service, signal) =>
      service.findAll(
        { category: scope, ...(brandId ? { brand: brandId } : {}) },
        signal,
      ),
    queryKey: dropdownTagsQueryKey(scope, brandId),
    service: createTagsService,
  });
  const allTags = externalTags ?? tagsQuery.data ?? EMPTY_TAGS;
  const isLoading = !externalTags && tagsQuery.isLoading;
  const { error: loadError } = tagsQuery;
  const hasTags = tagsQuery.data !== undefined;

  // A failed background refresh keeps the tags on screen without an alert.
  useEffect(() => {
    if (!loadError || hasTags) {
      return;
    }
    logger.error(
      `GET /tags ${scope ? `?category=${scope}` : ''} failed`,
      loadError,
    );
    notificationsService.error('Failed to load tags');
  }, [hasTags, loadError, notificationsService, scope]);

  // Calculate dropdown position when it opens
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const scrollY = window.scrollY || window.pageYOffset;
      const scrollX = window.scrollX || window.pageXOffset;

      // Dropdown width is 320px (w-80 = 20rem)
      const dropdownWidth = 320;
      const viewportWidth = window.innerWidth;

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
        queryClient.setQueriesData<ITag[]>(
          { queryKey: dropdownTagsQueryKey(scope, brandId) },
          (current) => [...(current ?? []), newTag],
        );
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
