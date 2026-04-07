'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import {
  AssetCategory,
  IngredientCategory,
  type IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import type {
  IAsset,
  IImage,
  IMusic,
  IQueryParams,
  IVideo,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type {
  UseModalGalleryProps,
  UseModalGalleryReturn,
} from '@props/modals/modal-gallery.props';
import { AssetsService } from '@services/content/assets.service';
import { PagesService } from '@services/content/pages.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { ImagesService } from '@services/ingredients/images.service';
import { MusicsService } from '@services/ingredients/musics.service';
import { VideosService } from '@services/ingredients/videos.service';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export function useModalGallery({
  category,
  isOpen,
  format,
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
  const [playingId, setPlayingId] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [items, setItems] = useState<(IVideo | IMusic | IImage)[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'media' | 'references' | 'uploads' | 'creations'
  >('media');
  const [filterReferenceId, setFilterReferenceId] = useState<string>(
    initialFilterReferenceId,
  );
  const [localFormat, setLocalFormat] = useState<IngredientFormat>(
    format as IngredientFormat,
  );
  const [uploads, setUploads] = useState<IImage[]>([]);
  const [references, setReferences] = useState<IAsset[]>([]);
  const [creations, setCreations] = useState<IImage[]>([]);
  const [isLoadingReferences, setIsLoadingReferences] = useState(false);
  const [isLoadingCreations, setIsLoadingCreations] = useState(false);
  const isLoadingReferencesRef = useRef(false);
  const isLoadingCreationsRef = useRef(false);

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

  const findAllReferences = useCallback(async () => {
    setIsLoadingReferences(true);
    isLoadingReferencesRef.current = true;

    try {
      const service = await getAssetsService();
      const query: IQueryParams = {
        category: AssetCategory.REFERENCE,
        lightweight: true, // Use lightweight mode for better performance
        page: 1,
        parent: brandId,
        parentModel: 'Brand',
        sort: 'createdAt: -1',
        // Filter by format for consistent aspect ratios when selecting references
        ...(localFormat && { format: localFormat }),
      };

      const data = await service.findAll(query as Record<string, unknown>);

      setReferences(data);
      logger.info('GET /assets (references)', {
        data: data.length,
        format: localFormat,
      });
    } catch (error) {
      logger.error('Failed to load brand references', error);
      notificationsService.error(
        'Failed to load brand references. Some files may be too large.',
      );
      setReferences([]);
    } finally {
      setIsLoadingReferences(false);
      isLoadingReferencesRef.current = false;
    }
  }, [getAssetsService, notificationsService, brandId, localFormat]);

  const findAllCreations = useCallback(
    async (pageOverride?: number) => {
      setIsLoadingCreations(true);
      isLoadingCreationsRef.current = true;

      const currentPage = pageOverride ?? (PagesService.getCurrentPage() || 1);

      try {
        const service = await getImagesService();
        const query: IQueryParams = {
          lightweight: true,
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          sort: 'createdAt: -1',
          // Only show generated/validated images (user's AI creations)
          status: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
        };

        if (brandId) {
          query.brand = brandId;
        }
        if (localFormat) {
          query.format = localFormat;
        }

        const data = await service.findAll(query as Record<string, unknown>);

        setCreations(data);
        logger.info('GET /images (creations)', {
          data: data.length,
          format: localFormat,
        });
      } catch (error) {
        logger.error('Failed to load creations', error);
        notificationsService.error('Failed to load your creations');
        setCreations([]);
      } finally {
        setIsLoadingCreations(false);
        isLoadingCreationsRef.current = false;
      }
    },
    [getImagesService, notificationsService, brandId, localFormat],
  );

  const findAllUploads = useCallback(
    async (pageOverride?: number) => {
      setIsLoading(true);

      const currentPage = pageOverride ?? (PagesService.getCurrentPage() || 1);

      try {
        const service = await getImagesService();
        const query: IQueryParams = {
          lightweight: true, // Use lightweight mode for better performance
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          sort: 'createdAt: -1',
          status: IngredientStatus.UPLOADED,
        };

        if (brandId) {
          query.brand = brandId;
        }
        // Only filter by format if localFormat is set and not empty
        if (localFormat) {
          query.format = localFormat;
        }

        const data = await service.findAll(query as Record<string, unknown>);

        setUploads(data);
        logger.info('GET /images (uploads)', {
          data: data.length,
          format: localFormat,
        });
      } catch (error) {
        logger.error('Failed to load uploads', error);
        notificationsService.error('Failed to load uploads');
        setUploads([]);
      } finally {
        setIsLoading(false);
      }
    },
    [getImagesService, notificationsService, brandId, localFormat],
  );

  const findAllItems = useCallback(
    async (pageOverride?: number) => {
      setIsLoading(true);

      const currentPage = pageOverride ?? (PagesService.getCurrentPage() || 1);

      try {
        const query: IQueryParams = {
          page: currentPage,
          sort: 'createdAt: -1',
          status: [IngredientStatus.GENERATED, IngredientStatus.VALIDATED],
        };

        switch (category) {
          case IngredientCategory.VIDEO: {
            const service = await getVideosService();
            query.limit = 12;

            if (brandId) {
              (query as Record<string, unknown>).brand = brandId;
            }
            if (filterReferenceId) {
              (query as Record<string, unknown>).reference = filterReferenceId;
            }

            // Only filter by format if localFormat is set and not empty
            if (localFormat) {
              query.format = localFormat;
            }

            const data = await service.findAll(
              query as Record<string, unknown>,
            );
            const filteredVideos = data.filter((video: IVideo) => {
              return (
                video.status !== IngredientStatus.FAILED &&
                video.status !== IngredientStatus.PROCESSING
              );
            });

            setItems(filteredVideos);
            logger.info('GET /videos', data);
            break;
          }
          case IngredientCategory.MUSIC: {
            const service = await getMusicsService();

            if (brandId) {
              (query as Record<string, unknown>).brand = brandId;
            }

            const musics = await service.findAll(query);

            setItems(musics);

            logger.info('GET /musics', {
              currentPage: PagesService.getCurrentPage(),
              items: musics.length,
              totalPages: PagesService.getTotalPages(),
            });
            break;
          }
          default: {
            const service = await getImagesService();
            query.limit = 12;
            query.lightweight = true; // Use lightweight mode for gallery performance

            if (brandId) {
              query.brand = brandId;
            }
            if (filterReferenceId) {
              query.reference = filterReferenceId;
            }

            // Only filter by format if localFormat is set and not empty
            if (localFormat) {
              query.format = localFormat;
            }

            const data = await service.findAll(
              query as Record<string, unknown>,
            );
            setItems(data);
            logger.info('GET /images', { data, format: localFormat });
            break;
          }
        }
      } catch (error) {
        logger.error(`Failed to load ${category}`, error);
        notificationsService.error(`Failed to load ${category}`);
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    },
    [
      category,
      getVideosService,
      getMusicsService,
      getImagesService,
      notificationsService,
      brandId,
      localFormat,
      filterReferenceId,
    ],
  );

  // Sync format prop to local state whenever format changes (not just on open)
  useEffect(() => {
    if (format) {
      setLocalFormat(format as IngredientFormat);
    }
  }, [format]);

  // Load items when modal opens, tab changes, or format changes
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Reset pagination when switching tabs
    PagesService.setCurrentPage(1);

    switch (activeTab) {
      case 'uploads':
        if (category === IngredientCategory.IMAGE) {
          // Always load uploads when tab is clicked
          setIsLoading(true);
          setUploads([]); // Clear previous uploads immediately
          findAllUploads();
        }
        break;

      case 'creations':
        if (category === IngredientCategory.IMAGE) {
          // Load user's generated images when tab is clicked
          if (!isLoadingCreationsRef.current) {
            setCreations([]); // Clear previous creations immediately
            findAllCreations();
          }
        }
        break;

      case 'references':
        if (category === IngredientCategory.IMAGE) {
          // Always load references when tab is clicked
          if (!isLoadingReferencesRef.current) {
            setReferences([]); // Clear previous references immediately
            findAllReferences();
          }
        }
        break;
      default:
        // Set loading state immediately when modal opens or tab changes
        setIsLoading(true);
        setItems([]); // Clear previous items immediately
        findAllItems();
        break;
    }
  }, [
    isOpen,
    activeTab,
    category,
    findAllUploads,
    findAllCreations,
    findAllReferences,
    findAllItems,
  ]);

  // Reset when closing
  useEffect(() => {
    if (!isOpen) {
      setItems([]);
      setUploads([]);
      setReferences([]);
      setCreations([]);
      setActiveTab('media');
      setSelectedItems([]);
      setSelectedItemsData([]);
      setIsLoading(true); // Reset loading state for next open
      setIsLoadingReferences(false);
      setIsLoadingCreations(false);
      isLoadingReferencesRef.current = false;
      isLoadingCreationsRef.current = false;
      PagesService.setCurrentPage(1);

      if (audioRef.current) {
        audioRef.current.pause();
        setPlayingId('');
      }
    }
  }, [isOpen]);

  // Create a stable string representation of selected references for comparison
  const selectedReferencesKey = useMemo(
    () =>
      initialSelectedReferences.length > 0
        ? [...initialSelectedReferences].sort().join(',')
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

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = '';
        audioRef.current = null;
      }
    };
  }, []);

  const handleMusicPlayPause = (musicId: string, musicUrl: string) => {
    if (playingId === musicId) {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setPlayingId('');
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(musicUrl);
      audio.play().catch(() => {
        setPlayingId('');
      });
      audio.onended = () => setPlayingId('');
      audioRef.current = audio;
      setPlayingId(musicId);
    }
  };

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
    findAllCreations,
    findAllItems,
    findAllReferences,
    findAllUploads,
    handleItemSelect,
    handleMusicPlayPause,
    isLoading,
    isLoadingCreations,
    isLoadingReferences,
    items,
    localFormat,
    notifySelectionLimit,
    playingId,
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
