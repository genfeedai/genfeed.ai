'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import {
  AssetCategory,
  IngredientCategory,
  type IngredientFormat,
  IngredientStatus,
} from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
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
  UseModalGalleryProps,
  UseModalGalleryReturn,
} from '@genfeedai/props/modals/modal-gallery.props';
import { AssetsService } from '@genfeedai/services/content/assets.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { NotificationsService } from '@genfeedai/services/core/notifications.service';
import { ImagesService } from '@genfeedai/services/ingredients/images.service';
import { MusicsService } from '@genfeedai/services/ingredients/musics.service';
import { VideosService } from '@genfeedai/services/ingredients/videos.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_ITEMS: never[] = [];

export function useModalGallery({
  category,
  isOpen,
  format,
  isFormatFilterEnabled = true,
  selectedId,
  maxSelectableItems,
  selectedReferences: initialSelectedReferences = [],
  filterReferenceId: initialFilterReferenceId = '',
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
  const [activeTab, setActiveTab] = useState<
    'media' | 'references' | 'uploads' | 'creations'
  >('media');
  const [filterReferenceId, setFilterReferenceId] = useState<string>(
    initialFilterReferenceId,
  );
  const [localFormat, setLocalFormat] = useState<IngredientFormat>(format);
  // `format` narrows what the gallery lists; a picker that accepts any aspect
  // ratio turns the narrowing off while the format control keeps its state.
  const formatFilter = isFormatFilterEnabled ? localFormat : undefined;
  const items =
    loadedPage?.tab === 'media' ? loadedPage.data.items : EMPTY_ITEMS;
  const uploads =
    loadedPage?.tab === 'uploads' ? loadedPage.data.items : EMPTY_ITEMS;
  const references =
    loadedPage?.tab === 'references' ? loadedPage.data.items : EMPTY_ITEMS;
  const creations =
    loadedPage?.tab === 'creations' ? loadedPage.data.items : EMPTY_ITEMS;
  const currentPage = loadedPage?.tab === activeTab ? loadedPage.data.page : 1;
  const totalPages =
    loadedPage?.tab === activeTab ? loadedPage.data.totalPages : 1;
  const isLoadingReferences = isLoading && activeTab === 'references';
  const isLoadingCreations = isLoading && activeTab === 'creations';

  const selectionLimit =
    typeof maxSelectableItems === 'number' && maxSelectableItems > 0
      ? maxSelectableItems
      : Infinity;

  const tabs = [
    {
      id: 'media',
      label: 'Images',
    },
    ...(category === IngredientCategory.IMAGE
      ? [
          {
            id: 'creations',
            label: 'My Creations',
          },
        ]
      : []),
    {
      id: 'references',
      label: 'Branding',
    },
    ...(category === IngredientCategory.IMAGE
      ? [
          {
            id: 'uploads',
            label: 'Uploads',
          },
        ]
      : []),
  ];

  const notificationsService = useMemo(
    () => NotificationsService.getInstance(),
    [],
  );

  const getVideosService = useAuthedService((token: string) =>
    VideosService.getInstance(token),
  );

  const getMusicsService = useAuthedService((token: string) =>
    MusicsService.getInstance(token),
  );

  const getImagesService = useAuthedService((token: string) =>
    ImagesService.getInstance(token),
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
      const controller = new AbortController();
      requestRef.current = controller;
      const { signal } = controller;
      setIsLoading(true);

      try {
        const query: IQueryParams = {
          page,
          sort: 'createdAt: -1',
          ...(formatFilter && { format: formatFilter }),
        };
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
        } else if (activeTab === 'uploads' || activeTab === 'creations') {
          const service = await getImagesService();
          if (signal.aborted) return;
          nextPage = {
            tab: activeTab,
            data: await service.findAllPage(
              {
                ...query,
                ...(brandId && { brand: brandId }),
                lightweight: true,
                limit: ITEMS_PER_PAGE,
                status:
                  activeTab === 'uploads'
                    ? IngredientStatus.UPLOADED
                    : [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
              },
              signal,
            ),
          };
        } else {
          query.status = [
            IngredientStatus.GENERATED,
            IngredientStatus.VALIDATED,
          ];
          if (brandId) query.brand = brandId;

          switch (category) {
            case IngredientCategory.VIDEO: {
              const service = await getVideosService();
              if (signal.aborted) return;
              const data = await service.findAllPage(
                {
                  ...query,
                  limit: 12,
                  ...(filterReferenceId && { reference: filterReferenceId }),
                },
                signal,
              );
              nextPage = {
                tab: 'media',
                data: {
                  ...data,
                  items: data.items.filter(
                    (video) =>
                      video.status !== IngredientStatus.FAILED &&
                      video.status !== IngredientStatus.PROCESSING,
                  ),
                },
              };
              break;
            }
            case IngredientCategory.MUSIC: {
              const service = await getMusicsService();
              if (signal.aborted) return;
              // Music has no aspect ratio filter.
              delete query.format;
              nextPage = {
                tab: 'media',
                data: await service.findAllPage(query, signal),
              };
              break;
            }
            default: {
              const service = await getImagesService();
              if (signal.aborted) return;
              nextPage = {
                tab: 'media',
                data: await service.findAllPage(
                  {
                    ...query,
                    lightweight: true,
                    limit: 12,
                    ...(filterReferenceId && { reference: filterReferenceId }),
                  },
                  signal,
                ),
              };
            }
          }
        }

        if (!signal.aborted) setLoadedPage(nextPage);
      } catch (error) {
        if (signal.aborted) return;
        logger.error('Failed to load gallery page', error);
        notificationsService.error(
          activeTab === 'references'
            ? 'Failed to load brand references. Some files may be too large.'
            : activeTab === 'creations'
              ? 'Failed to load your creations'
              : activeTab === 'uploads'
                ? 'Failed to load uploads'
                : `Failed to load ${category}`,
        );
        setLoadedPage(null);
      } finally {
        if (!signal.aborted) setIsLoading(false);
      }
    },
    [
      activeTab,
      brandId,
      category,
      filterReferenceId,
      formatFilter,
      getAssetsService,
      getImagesService,
      getMusicsService,
      getVideosService,
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
    if (!isOpen || category !== IngredientCategory.IMAGE) {
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
    } else if (category === IngredientCategory.IMAGE) {
      setSelectedItems((prev) => {
        if (prev.includes(item.id)) {
          setSelectedItemsData((prevData) =>
            prevData.filter((i) => i.id !== item.id),
          );
          return prev.filter((id) => id !== item.id);
        }

        if (selectionLimit === 1) {
          setSelectedItemsData([item as IImage]);
          return [item.id];
        }

        if (prev.length < selectionLimit) {
          // Prevent duplicates in selectedItemsData
          setSelectedItemsData((prevData) => {
            if (prevData.some((i) => i.id === item.id)) {
              return prevData; // Already exists, don't add again
            }
            return [...prevData, item as IImage];
          });
          return [...prev, item.id];
        }

        notifySelectionLimit();
        return prev;
      });
    }
  };

  return {
    activeTab,
    creations,
    filterReferenceId,
    currentPage,
    totalPages,
    loadPage,
    handleItemSelect,
    isLoading,
    isLoadingCreations,
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
    setFilterReferenceId,
    setLocalFormat,
    setSelectedItem,
    setSelectedItems,
    setSelectedItemsData,
    tabs,
    uploads,
  };
}
