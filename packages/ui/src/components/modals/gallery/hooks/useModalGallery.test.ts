import {
  IngredientCategory,
  IngredientFormat,
  IngredientStatus,
} from '@genfeedai/enums';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Hoist mock objects so they're available when vi.mock factories run
const {
  mockNotificationsService,
  mockVideosService,
  mockMusicsService,
  mockImagesService,
  mockAssetsService,
  mockPagesService,
} = vi.hoisted(() => ({
  mockAssetsService: {
    findAll: vi.fn().mockResolvedValue([]),
  },
  mockImagesService: {
    findAll: vi.fn().mockResolvedValue([]),
  },
  mockMusicsService: {
    findAll: vi.fn().mockResolvedValue([]),
  },
  mockNotificationsService: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
  mockPagesService: {
    getCurrentPage: vi.fn(() => 1),
    getTotalPages: vi.fn(() => 1),
    setCurrentPage: vi.fn(),
  },
  mockVideosService: {
    findAll: vi.fn().mockResolvedValue([]),
  },
}));

// Mock dependencies
vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({ brandId: 'brand_test123' })),
}));

vi.mock('@genfeedai/hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: vi.fn((factory) => async () => factory('mock-token')),
}));

vi.mock('@genfeedai/services/core/logger.service', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@genfeedai/services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: vi.fn(() => mockNotificationsService),
  },
}));

vi.mock('@genfeedai/services/ingredients/videos.service', () => ({
  VideosService: {
    getInstance: vi.fn(() => mockVideosService),
  },
}));

vi.mock('@genfeedai/services/ingredients/musics.service', () => ({
  MusicsService: {
    getInstance: vi.fn(() => mockMusicsService),
  },
}));

vi.mock('@genfeedai/services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: vi.fn(() => mockImagesService),
  },
}));

vi.mock('@genfeedai/services/content/assets.service', () => ({
  AssetsService: {
    getInstance: vi.fn(() => mockAssetsService),
  },
}));

vi.mock('@genfeedai/services/content/pages.service', () => ({
  PagesService: mockPagesService,
}));

// Import after mocks
import { useModalGallery } from '@ui/modals/gallery/hooks/useModalGallery';

describe('useModalGallery', () => {
  const defaultProps = {
    category: IngredientCategory.IMAGE,
    format: IngredientFormat.LANDSCAPE,
    isOpen: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockVideosService.findAll.mockResolvedValue([]);
    mockMusicsService.findAll.mockResolvedValue([]);
    mockImagesService.findAll.mockResolvedValue([]);
    mockAssetsService.findAll.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default state', () => {
      const { result } = renderHook(() => useModalGallery(defaultProps));

      expect(result.current.items).toEqual([]);
      expect(result.current.uploads).toEqual([]);
      expect(result.current.references).toEqual([]);
      expect(result.current.selectedItem).toBe('');
      expect(result.current.selectedItems).toEqual([]);
      expect(result.current.isLoading).toBe(true);
      expect(result.current.activeTab).toBe('media');
    });

    it('should initialize with selected ID when provided', () => {
      const { result } = renderHook(() =>
        useModalGallery({ ...defaultProps, selectedId: 'item_123' }),
      );

      expect(result.current.selectedItem).toBe('item_123');
    });

    it('should set selection limit based on maxSelectableItems', () => {
      const { result } = renderHook(() =>
        useModalGallery({ ...defaultProps, maxSelectableItems: 3 }),
      );

      expect(result.current.selectionLimit).toBe(3);
    });

    it('should set Infinity for selectionLimit when maxSelectableItems is not provided', () => {
      const { result } = renderHook(() => useModalGallery(defaultProps));

      expect(result.current.selectionLimit).toBe(Infinity);
    });
  });

  describe('tabs', () => {
    it('should show uploads tab for image category', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
        }),
      );

      const tabIds = result.current.tabs.map((t) => t.id);
      expect(tabIds).toContain('uploads');
    });

    it('should not show uploads tab for video category', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.VIDEO,
        }),
      );

      const tabIds = result.current.tabs.map((t) => t.id);
      expect(tabIds).not.toContain('uploads');
    });

    it('should not show uploads tab for music category', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.MUSIC,
        }),
      );

      const tabIds = result.current.tabs.map((t) => t.id);
      expect(tabIds).not.toContain('uploads');
    });

    it('should always show media and references tabs', () => {
      const { result } = renderHook(() => useModalGallery(defaultProps));

      const tabIds = result.current.tabs.map((t) => t.id);
      expect(tabIds).toContain('media');
      expect(tabIds).toContain('references');
    });
  });

  describe('data loading', () => {
    it('should load images when modal opens with image category', async () => {
      const mockImages = [
        { id: 'img_1', status: IngredientStatus.GENERATED },
        { id: 'img_2', status: IngredientStatus.VALIDATED },
      ];
      mockImagesService.findAll.mockResolvedValue(mockImages);

      const { result, rerender } = renderHook(
        (props) => useModalGallery(props),
        { initialProps: defaultProps },
      );

      rerender({ ...defaultProps, isOpen: true });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockImagesService.findAll).toHaveBeenCalled();
    });

    it('should load videos when modal opens with video category', async () => {
      const mockVideos = [
        { id: 'vid_1', status: IngredientStatus.GENERATED },
        { id: 'vid_2', status: IngredientStatus.VALIDATED },
      ];
      mockVideosService.findAll.mockResolvedValue(mockVideos);

      const videoProps = {
        ...defaultProps,
        category: IngredientCategory.VIDEO,
        isOpen: true,
      };

      const { result } = renderHook(() => useModalGallery(videoProps));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockVideosService.findAll).toHaveBeenCalled();
    });

    it('should filter out failed and processing videos', async () => {
      const mockVideos = [
        { id: 'vid_1', status: IngredientStatus.GENERATED },
        { id: 'vid_2', status: IngredientStatus.FAILED },
        { id: 'vid_3', status: IngredientStatus.PROCESSING },
        { id: 'vid_4', status: IngredientStatus.VALIDATED },
      ];
      mockVideosService.findAll.mockResolvedValue(mockVideos);

      const videoProps = {
        ...defaultProps,
        category: IngredientCategory.VIDEO,
        isOpen: true,
      };

      const { result } = renderHook(() => useModalGallery(videoProps));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toHaveLength(2);
      expect(result.current.items.map((i: any) => i.id)).toEqual([
        'vid_1',
        'vid_4',
      ]);
    });

    it('should load musics when modal opens with music category', async () => {
      const mockMusics = [{ id: 'mus_1' }, { id: 'mus_2' }];
      mockMusicsService.findAll.mockResolvedValue(mockMusics);

      const musicProps = {
        ...defaultProps,
        category: IngredientCategory.MUSIC,
        isOpen: true,
      };

      const { result } = renderHook(() => useModalGallery(musicProps));

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockMusicsService.findAll).toHaveBeenCalled();
    });

    it('should handle data loading errors gracefully', async () => {
      mockImagesService.findAll.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() =>
        useModalGallery({ ...defaultProps, isOpen: true }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.items).toEqual([]);
      expect(mockNotificationsService.error).toHaveBeenCalled();
    });
  });

  describe('references loading', () => {
    it('should load references when switching to references tab', async () => {
      const mockRefs = [{ id: 'ref_1' }, { id: 'ref_2' }];
      mockAssetsService.findAll.mockResolvedValue(mockRefs);

      const { result } = renderHook(() =>
        useModalGallery({ ...defaultProps, isOpen: true }),
      );

      act(() => {
        result.current.setActiveTab('references');
      });

      await waitFor(() => {
        expect(result.current.isLoadingReferences).toBe(false);
      });

      expect(mockAssetsService.findAll).toHaveBeenCalled();
    });

    it('should handle references loading error', async () => {
      mockAssetsService.findAll.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() =>
        useModalGallery({ ...defaultProps, isOpen: true }),
      );

      act(() => {
        result.current.setActiveTab('references');
      });

      await waitFor(() => {
        expect(result.current.isLoadingReferences).toBe(false);
      });

      expect(result.current.references).toEqual([]);
      expect(mockNotificationsService.error).toHaveBeenCalled();
    });
  });

  describe('uploads loading', () => {
    it('should load uploads when switching to uploads tab', async () => {
      const mockUploads = [{ id: 'upload_1' }, { id: 'upload_2' }];
      mockImagesService.findAll.mockResolvedValue(mockUploads);

      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
          isOpen: true,
        }),
      );

      act(() => {
        result.current.setActiveTab('uploads');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(mockImagesService.findAll).toHaveBeenCalled();
    });

    it('should handle uploads loading error', async () => {
      mockImagesService.findAll.mockRejectedValue(new Error('Failed'));

      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
          isOpen: true,
        }),
      );

      act(() => {
        result.current.setActiveTab('uploads');
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.uploads).toEqual([]);
    });
  });

  describe('item selection', () => {
    it('should select a single item for music category', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.MUSIC,
          isOpen: true,
        }),
      );

      const mockItem = { id: 'mus_1', label: 'Test Music' };

      act(() => {
        result.current.handleItemSelect(mockItem as any);
      });

      expect(result.current.selectedItem).toBe('mus_1');
    });

    it('should toggle image selection', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
          isOpen: true,
        }),
      );

      const mockItem = { id: 'img_1', label: 'Test Image' };

      // Select item
      act(() => {
        result.current.handleItemSelect(mockItem as any);
      });

      expect(result.current.selectedItems).toContain('img_1');

      // Deselect item
      act(() => {
        result.current.handleItemSelect(mockItem as any);
      });

      expect(result.current.selectedItems).not.toContain('img_1');
    });

    it('should replace selection when selectionLimit is 1', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
          isOpen: true,
          maxSelectableItems: 1,
        }),
      );

      const item1 = { id: 'img_1', label: 'Image 1' };
      const item2 = { id: 'img_2', label: 'Image 2' };

      act(() => {
        result.current.handleItemSelect(item1 as any);
      });

      expect(result.current.selectedItems).toEqual(['img_1']);

      act(() => {
        result.current.handleItemSelect(item2 as any);
      });

      expect(result.current.selectedItems).toEqual(['img_2']);
      expect(result.current.selectedItems).not.toContain('img_1');
    });

    it('should respect selection limit for multiple items', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
          isOpen: true,
          maxSelectableItems: 2,
        }),
      );

      const items = [
        { id: 'img_1', label: 'Image 1' },
        { id: 'img_2', label: 'Image 2' },
        { id: 'img_3', label: 'Image 3' },
      ];

      // Select first two items
      act(() => {
        result.current.handleItemSelect(items[0] as any);
        result.current.handleItemSelect(items[1] as any);
      });

      expect(result.current.selectedItems).toHaveLength(2);

      // Try to select third item
      act(() => {
        result.current.handleItemSelect(items[2] as any);
      });

      // Should still be 2, third item rejected
      expect(result.current.selectedItems).toHaveLength(2);
      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'You can only select up to 2 items.',
      );
    });

    it('should update selectedItemsData when selecting images', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
          isOpen: true,
        }),
      );

      const mockItem = { id: 'img_1', label: 'Test Image', url: 'test.jpg' };

      act(() => {
        result.current.handleItemSelect(mockItem as any);
      });

      expect(result.current.selectedItemsData).toHaveLength(1);
      expect(result.current.selectedItemsData[0].id).toBe('img_1');
    });
  });

  describe('notifySelectionLimit', () => {
    it('should show notification for finite selection limit', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          isOpen: true,
          maxSelectableItems: 3,
        }),
      );

      act(() => {
        result.current.notifySelectionLimit();
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'You can only select up to 3 items.',
      );
    });

    it('should not show notification for infinite selection limit', () => {
      const { result } = renderHook(() =>
        useModalGallery({ ...defaultProps, isOpen: true }),
      );

      act(() => {
        result.current.notifySelectionLimit();
      });

      expect(mockNotificationsService.error).not.toHaveBeenCalled();
    });

    it('should use singular item for limit of 1', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          isOpen: true,
          maxSelectableItems: 1,
        }),
      );

      act(() => {
        result.current.notifySelectionLimit();
      });

      expect(mockNotificationsService.error).toHaveBeenCalledWith(
        'You can only select up to 1 item.',
      );
    });
  });

  describe('music playback', () => {
    it('should play music when handleMusicPlayPause is called', () => {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      const mockPause = vi.fn();

      vi.spyOn(window, 'Audio').mockImplementation(
        () =>
          ({
            onended: null,
            pause: mockPause,
            play: mockPlay,
            src: '',
          }) as unknown as HTMLAudioElement,
      );

      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.MUSIC,
          isOpen: true,
        }),
      );

      act(() => {
        result.current.handleMusicPlayPause('mus_1', 'http://test.mp3');
      });

      expect(result.current.playingId).toBe('mus_1');
      expect(mockPlay).toHaveBeenCalled();
    });

    it('should pause music when same ID is clicked again', () => {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      const mockPause = vi.fn();

      vi.spyOn(window, 'Audio').mockImplementation(
        () =>
          ({
            onended: null,
            pause: mockPause,
            play: mockPlay,
            src: '',
          }) as unknown as HTMLAudioElement,
      );

      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.MUSIC,
          isOpen: true,
        }),
      );

      // Play
      act(() => {
        result.current.handleMusicPlayPause('mus_1', 'http://test.mp3');
      });

      expect(result.current.playingId).toBe('mus_1');

      // Pause (click same)
      act(() => {
        result.current.handleMusicPlayPause('mus_1', 'http://test.mp3');
      });

      expect(result.current.playingId).toBe('');
    });

    it('should switch to different music when new ID is clicked', () => {
      const mockPlay = vi.fn().mockResolvedValue(undefined);
      const mockPause = vi.fn();

      vi.spyOn(window, 'Audio').mockImplementation(
        () =>
          ({
            onended: null,
            pause: mockPause,
            play: mockPlay,
            src: '',
          }) as unknown as HTMLAudioElement,
      );

      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.MUSIC,
          isOpen: true,
        }),
      );

      // Play first
      act(() => {
        result.current.handleMusicPlayPause('mus_1', 'http://test1.mp3');
      });

      expect(result.current.playingId).toBe('mus_1');

      // Play second (different)
      act(() => {
        result.current.handleMusicPlayPause('mus_2', 'http://test2.mp3');
      });

      expect(result.current.playingId).toBe('mus_2');
    });
  });

  describe('format changes', () => {
    it('should update localFormat when format prop changes', () => {
      const { result, rerender } = renderHook(
        (props) => useModalGallery(props),
        {
          initialProps: { ...defaultProps, format: IngredientFormat.LANDSCAPE },
        },
      );

      expect(result.current.localFormat).toBe(IngredientFormat.LANDSCAPE);

      rerender({ ...defaultProps, format: IngredientFormat.PORTRAIT });

      expect(result.current.localFormat).toBe(IngredientFormat.PORTRAIT);
    });

    it('should allow manual format changes via setLocalFormat', () => {
      const { result } = renderHook(() =>
        useModalGallery({ ...defaultProps, isOpen: true }),
      );

      act(() => {
        result.current.setLocalFormat(IngredientFormat.SQUARE);
      });

      expect(result.current.localFormat).toBe(IngredientFormat.SQUARE);
    });
  });

  describe('modal close', () => {
    it('should reset state when modal closes', async () => {
      const mockImages = [{ id: 'img_1' }];
      mockImagesService.findAll.mockResolvedValue(mockImages);

      const { result, rerender } = renderHook(
        (props) => useModalGallery(props),
        {
          initialProps: { ...defaultProps, isOpen: true },
        },
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Select an item
      act(() => {
        result.current.handleItemSelect({ id: 'img_1' } as any);
      });

      expect(result.current.selectedItems).toContain('img_1');

      // Close modal
      rerender({ ...defaultProps, isOpen: false });

      expect(result.current.items).toEqual([]);
      expect(result.current.uploads).toEqual([]);
      expect(result.current.references).toEqual([]);
      expect(result.current.selectedItems).toEqual([]);
      expect(result.current.activeTab).toBe('media');
    });
  });

  describe('filter reference', () => {
    it('should set filter reference ID', () => {
      const { result } = renderHook(() =>
        useModalGallery({ ...defaultProps, isOpen: true }),
      );

      act(() => {
        result.current.setFilterReferenceId('ref_123');
      });

      expect(result.current.filterReferenceId).toBe('ref_123');
    });

    it('should initialize with filterReferenceId prop', () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          filterReferenceId: 'ref_initial',
          isOpen: true,
        }),
      );

      expect(result.current.filterReferenceId).toBe('ref_initial');
    });
  });

  describe('selected references sync', () => {
    it('should sync selected references when modal opens', async () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
          isOpen: true,
          selectedReferences: ['ref_1', 'ref_2'],
        }),
      );

      await waitFor(() => {
        expect(result.current.selectedItems).toEqual(['ref_1', 'ref_2']);
      });
    });

    it('should sync selectedId when no selectedReferences provided', async () => {
      const { result } = renderHook(() =>
        useModalGallery({
          ...defaultProps,
          category: IngredientCategory.IMAGE,
          isOpen: true,
          selectedId: 'single_ref',
        }),
      );

      await waitFor(() => {
        expect(result.current.selectedItems).toEqual(['single_ref']);
      });
    });
  });

  describe('return value completeness', () => {
    it('should return all expected properties', () => {
      const { result } = renderHook(() => useModalGallery(defaultProps));

      expect(result.current).toHaveProperty('activeTab');
      expect(result.current).toHaveProperty('filterReferenceId');
      expect(result.current).toHaveProperty('findAllItems');
      expect(result.current).toHaveProperty('findAllReferences');
      expect(result.current).toHaveProperty('findAllUploads');
      expect(result.current).toHaveProperty('handleItemSelect');
      expect(result.current).toHaveProperty('handleMusicPlayPause');
      expect(result.current).toHaveProperty('isLoading');
      expect(result.current).toHaveProperty('isLoadingReferences');
      expect(result.current).toHaveProperty('items');
      expect(result.current).toHaveProperty('localFormat');
      expect(result.current).toHaveProperty('notifySelectionLimit');
      expect(result.current).toHaveProperty('playingId');
      expect(result.current).toHaveProperty('references');
      expect(result.current).toHaveProperty('selectedItem');
      expect(result.current).toHaveProperty('selectedItems');
      expect(result.current).toHaveProperty('selectedItemsData');
      expect(result.current).toHaveProperty('selectionLimit');
      expect(result.current).toHaveProperty('setActiveTab');
      expect(result.current).toHaveProperty('setFilterReferenceId');
      expect(result.current).toHaveProperty('setLocalFormat');
      expect(result.current).toHaveProperty('setSelectedItem');
      expect(result.current).toHaveProperty('setSelectedItems');
      expect(result.current).toHaveProperty('setSelectedItemsData');
      expect(result.current).toHaveProperty('tabs');
      expect(result.current).toHaveProperty('uploads');
    });
  });
});
