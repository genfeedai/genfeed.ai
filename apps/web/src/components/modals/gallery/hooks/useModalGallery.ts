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
import { useAuthedService } from '@genfeedai/hooks/auth/use-authed-service/use-authed-service';
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_ITEMS: never[] = [];

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
  const [loadedPage, setLoadedPage] = useState<GalleryLoadedPage | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<GalleryTab>('media');
  const [localFormat, setLocalFormat] = useState<IngredientFormat>(format);
  const items =
    loadedPage?.tab === 'media' ? loadedPage.data.items : EMPTY_ITEMS;
  const references =
    loadedPage?.tab === 'references' ? loadedPage.data.items : EMPTY_ITEMS;
  const currentPage = loadedPage?.tab === activeTab ? loadedPage.data.page : 1;
  const totalPages =
    loadedPage?.tab === activeTab ? loadedPage.data.totalPages : 1;
  const isLoadingReferences = isLoading && activeTab === 'references';
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

  const getMusicsService = useAuthedService((token: string) =>
    MusicsService.getInstance(token),
  );

  const getAssetsService = useAuthedService((token: string) =>
    AssetsService.getInstance(token),
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

  const loadPage = useCallback(
    async (page = 1) => {
      requestRef.current?.abort();
      if (isLibraryTab) {
        return;
      }

      const controller = new AbortController();
      requestRef.current = controller;
      const { signal } = controller;
      setIsLoading(true);

      try {
        const query: IQueryParams = { page, sort: 'createdAt: -1' };
        let nextPage: GalleryLoadedPage;

        if (activeTab === 'references') {
          const service = await getAssetsService();
          if (signal.aborted) return;
          nextPage = {
            tab: 'references',
            data: await service.findAllPage(
              {
                ...query,
                category: AssetCategory.REFERENCE,
                lightweight: true,
                parent: brandId,
                parentModel: 'Brand',
              },
              signal,
            ),
          };
        } else {
          const service = await getMusicsService();
          if (signal.aborted) return;
          nextPage = {
            tab: 'media',
            data: await service.findAllPage(
              {
                ...query,
                ...(brandId && { brand: brandId }),
                status: [
                  IngredientStatus.GENERATED,
                  IngredientStatus.VALIDATED,
                ],
              },
              signal,
            ),
          };
        }

        if (!signal.aborted) setLoadedPage(nextPage);
      } catch (error) {
        if (signal.aborted) return;
        logger.error('Failed to load gallery page', error);
        notificationsService.error(
          activeTab === 'references'
            ? 'Failed to load brand references. Some files may be too large.'
            : 'Failed to load music',
        );
        setLoadedPage(null);
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    },
    [
      activeTab,
      brandId,
      getAssetsService,
      getMusicsService,
      isLibraryTab,
      notificationsService,
    ],
  );

  // Sync format prop to local state whenever format changes (not just on open)
  useEffect(() => {
    if (format) {
      setLocalFormat(format);
    }
  }, [format]);

  useEffect(() => {
    if (!isOpen) return;
    setLoadedPage(null);
    void loadPage(1);
    return () => requestRef.current?.abort();
  }, [isOpen, loadPage]);

  useEffect(() => {
    if (!isOpen) {
      setLoadedPage(null);
      setActiveTab('media');
      setSelectedItems([]);
      setSelectedItemsData([]);
      setIsLoading(true);
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
