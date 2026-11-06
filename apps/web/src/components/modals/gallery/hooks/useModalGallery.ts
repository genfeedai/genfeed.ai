'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AssetCategory,
  IngredientCategory,
  type IngredientFormat,
  IngredientStatus,
} from '@genfeedai/contracts';
import type {
  IAsset,
  IImage,
  IMusic,
  IQueryParams,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import type {
  GalleryLoadedPage,
  GalleryTab,
  UseModalGalleryProps,
  UseModalGalleryReturn,
} from '@genfeedai/props/modals/modal-gallery.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { MusicsService } from '@genfeedai/services/ingredients/musics.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_ITEMS: never[] = [];

/** What the gallery pages itself: music tracks or the brand's references. */
type GalleryResource = 'brand-references' | 'music';

interface GalleryPageRequest {
  page: number;
  tab: GalleryTab;
}

interface GalleryServices {
  assets: AssetsService;
  musics: MusicsService;
}

function createGalleryServices(token: string): GalleryServices {
  return {
    assets: AssetsService.getInstance(token),
    musics: MusicsService.getInstance(token),
  };
}

export function useModalGallery({
  category,
  isOpen,
  format,
  selectedId,
  maxSelectableItems,
  selectedReferences: initialSelectedReferences = [],
}: UseModalGalleryProps): UseModalGalleryReturn {
  const { brandId } = useBrand();
  const [selectedItem, setSelectedItem] = useState<string>(selectedId || '');
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectedItemsData, setSelectedItemsData] = useState<
    (IVideo | IMusic | IImage)[]
  >([]);
  const [activeTab, setActiveTab] = useState<GalleryTab>('media');
  const [localFormat, setLocalFormat] = useState<IngredientFormat>(format);
  // Images and videos list through the Library grid, which loads itself; the
  // gallery pages only music tracks and brand references.
  const isLibraryTab =
    activeTab === 'media' && category !== IngredientCategory.MUSIC;

  // A video slot holds one clip unless the caller asks for more.
  const selectionLimit =
    typeof maxSelectableItems === 'number' && maxSelectableItems > 0
      ? maxSelectableItems
      : category === IngredientCategory.VIDEO
        ? 1
        : Infinity;

  const tabs: Array<{ id: GalleryTab; label: string }> =
    category === IngredientCategory.IMAGE
      ? [
          { id: 'media', label: 'Library' },
          { id: 'references', label: 'Branding' },
        ]
      : [];

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const notifySelectionLimit = () => {
    if (Number.isFinite(selectionLimit)) {
      notificationsService.error(
        `You can only select up to ${selectionLimit} item${
          selectionLimit === 1 ? '' : 's'
        }.`,
      );
    }
  };

  // The page belongs to the tab it was picked on: another tab starts at one.
  const [pageRequest, setPageRequest] = useState<GalleryPageRequest>({
    page: 1,
    tab: 'media',
  });
  const page = pageRequest.tab === activeTab ? pageRequest.page : 1;
  const resource: GalleryResource =
    activeTab === 'references' ? 'brand-references' : 'music';
  const scopeKey = ['modal-gallery', resource, brandId ?? null] as const;

  // Music tracks and brand references are cached per brand and page, so a
  // reopened picker paints its last list at once and refreshes it in the
  // background; another page keeps the current rows until it lands.
  const pageQuery = useAuthedQuery<GalleryServices, GalleryLoadedPage>({
    enabled: isOpen && !isLibraryTab,
    keepPreviousDataWithin: scopeKey,
    queryFn: async (services, signal) => {
      const query: IQueryParams = { page, sort: 'createdAt: -1' };
      if (resource === 'brand-references') {
        return {
          data: await services.assets.findAllPage(
            {
              ...query,
              category: AssetCategory.REFERENCE,
              lightweight: true,
              parent: brandId,
              parentModel: 'Brand',
            },
            signal,
          ),
          tab: 'references',
        };
      }
      return {
        data: await services.musics.findAllPage(
          {
            ...query,
            ...(brandId && { brand: brandId }),
            status: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
          },
          signal,
        ),
        tab: 'media',
      };
    },
    queryKey: [...scopeKey, { page }],
    service: createGalleryServices,
  });

  // A closed picker shows nothing; the cache paints it again on reopen.
  const loadedPage = isOpen && !isLibraryTab ? pageQuery.data : undefined;
  const items =
    loadedPage?.tab === 'media' ? loadedPage.data.items : EMPTY_ITEMS;
  const references =
    loadedPage?.tab === 'references' ? loadedPage.data.items : EMPTY_ITEMS;
  // While the next page loads, the pager already shows the one asked for.
  const currentPage =
    loadedPage?.tab !== activeTab
      ? 1
      : pageQuery.isPlaceholderData
        ? page
        : loadedPage.data.page;
  const totalPages =
    loadedPage?.tab === activeTab ? loadedPage.data.totalPages : 1;
  const isLoading = isOpen && !isLibraryTab && pageQuery.isLoading;
  const isLoadingReferences = isLoading && activeTab === 'references';

  // Only a read with nothing to show says so; a failed background refresh
  // keeps the list on screen.
  const pageError = pageQuery.error;
  const hasPageData = pageQuery.data !== undefined;
  useEffect(() => {
    if (!pageError || hasPageData) {
      return;
    }
    logger.error('Failed to load gallery page', pageError);
    notificationsService.error(
      resource === 'brand-references'
        ? 'Failed to load brand references. Some files may be too large.'
        : 'Failed to load music',
    );
  }, [hasPageData, notificationsService, pageError, resource]);

  const loadPage = useCallback(
    async (nextPage = 1) => {
      setPageRequest({ page: nextPage, tab: activeTab });
    },
    [activeTab],
  );

  // Sync format prop to local state whenever format changes (not just on open)
  useEffect(() => {
    if (format) {
      setLocalFormat(format);
    }
  }, [format]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab('media');
      setPageRequest({ page: 1, tab: 'media' });
      setSelectedItems([]);
      setSelectedItemsData([]);
    }
  }, [isOpen]);

  // Create a stable string representation of selected references for comparison
  const selectedReferencesKey = useMemo(
    () =>
      initialSelectedReferences.length > 0
        ? initialSelectedReferences.toSorted().join(',')
        : selectedId || '',
    [initialSelectedReferences, selectedId],
  );

  // Sync selected references when modal opens
  // Use a ref to track the last synced values to avoid infinite loops
  const lastSyncedRef = useRef<string>('');

  useEffect(() => {
    if (!isOpen || category === IngredientCategory.MUSIC) {
      // Reset when modal closes
      if (!isOpen) {
        lastSyncedRef.current = '';
      }
      return;
    }

    // Only sync if the values have actually changed
    if (
      selectedReferencesKey !== lastSyncedRef.current &&
      selectedReferencesKey
    ) {
      if (initialSelectedReferences.length > 0) {
        setSelectedItems([...initialSelectedReferences]);
        lastSyncedRef.current = selectedReferencesKey;
      } else if (selectedId) {
        setSelectedItems([selectedId]);
        lastSyncedRef.current = selectedReferencesKey;
      }
    }
  }, [
    isOpen,
    category,
    selectedId,
    selectedReferencesKey,
    initialSelectedReferences,
  ]);

  const handleItemSelect = (item: IVideo | IMusic | IImage | IAsset) => {
    if (category === IngredientCategory.MUSIC) {
      setSelectedItem(item.id);
      return;
    }

    const media = item as IVideo | IImage;

    if (selectedItems.includes(item.id)) {
      setSelectedItems(selectedItems.filter((id) => id !== item.id));
      setSelectedItemsData((prevData) =>
        prevData.filter((i) => i.id !== item.id),
      );
      return;
    }

    if (selectionLimit === 1) {
      setSelectedItems([item.id]);
      setSelectedItemsData([media]);
      return;
    }

    if (selectedItems.length >= selectionLimit) {
      notifySelectionLimit();
      return;
    }

    setSelectedItems([...selectedItems, item.id]);
    setSelectedItemsData((prevData) =>
      prevData.some((i) => i.id === item.id) ? prevData : [...prevData, media],
    );
  };

  return {
    activeTab,
    currentPage,
    totalPages,
    loadPage,
    handleItemSelect,
    isLoading,
    isLoadingReferences,
    items,
    localFormat,
    notifySelectionLimit,
    references,
    selectedItem,
    selectedItems,
    selectedItemsData,
    selectionLimit,
    setActiveTab,
    setSelectedItem,
    setSelectedItems,
    setSelectedItemsData,
    tabs,
  };
}
