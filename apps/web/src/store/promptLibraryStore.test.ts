import type { IPrompt } from '@genfeedai/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePromptLibraryStore } from './promptLibraryStore';

// Mock the API
vi.mock('@/lib/api', () => ({
  promptsApi: {
    create: vi.fn().mockResolvedValue({ _id: 'new-item' }),
    delete: vi.fn().mockResolvedValue({}),
    duplicate: vi.fn().mockResolvedValue({ _id: 'duplicated-item', name: 'Copy' }),
    getAll: vi.fn().mockResolvedValue([]),
    getFeatured: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ _id: 'updated-item' }),
    use: vi.fn().mockResolvedValue({ _id: 'used-item', useCount: 11 }),
  },
}));

describe('usePromptLibraryStore', () => {
  const mockItem: IPrompt = {
    _id: 'item-1',
    aspectRatio: '16:9',
    category: 'landscape',
    createdAt: new Date().toISOString(),
    description: 'A test prompt',
    isDeleted: false,
    isFeatured: false,
    isSystem: false,
    name: 'Test Prompt',
    preferredModel: 'nano-banana-pro',
    promptText: 'Generate a beautiful image',
    styleSettings: {},
    tags: ['nature'],
    thumbnail: undefined,
    updatedAt: new Date().toISOString(),
    useCount: 5,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store to initial state
    usePromptLibraryStore.setState({
      categoryFilter: null,
      editingItem: null,
      error: null,
      featuredItems: [],
      isCreateModalOpen: false,
      isLoading: false,
      isPickerOpen: false,
      items: [],
      searchQuery: '',
      selectedItem: null,
    });
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = usePromptLibraryStore.getState();

      expect(state.items).toEqual([]);
      expect(state.featuredItems).toEqual([]);
      expect(state.selectedItem).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.searchQuery).toBe('');
      expect(state.categoryFilter).toBeNull();
      expect(state.isPickerOpen).toBe(false);
      expect(state.isCreateModalOpen).toBe(false);
      expect(state.editingItem).toBeNull();
    });
  });

  describe('UI Actions', () => {
    describe('setSearchQuery', () => {
      it('should set the search query', () => {
        const { setSearchQuery } = usePromptLibraryStore.getState();

        setSearchQuery('sunset');

        expect(usePromptLibraryStore.getState().searchQuery).toBe('sunset');
      });

      it('should clear the search query', () => {
        usePromptLibraryStore.setState({ searchQuery: 'test' });
        const { setSearchQuery } = usePromptLibraryStore.getState();

        setSearchQuery('');

        expect(usePromptLibraryStore.getState().searchQuery).toBe('');
      });
    });

    describe('setCategoryFilter', () => {
      it('should set the category filter', () => {
        const { setCategoryFilter } = usePromptLibraryStore.getState();

        setCategoryFilter('landscape');

        expect(usePromptLibraryStore.getState().categoryFilter).toBe('landscape');
      });

      it('should clear the category filter', () => {
        usePromptLibraryStore.setState({ categoryFilter: 'portrait' });
        const { setCategoryFilter } = usePromptLibraryStore.getState();

        setCategoryFilter(null);

        expect(usePromptLibraryStore.getState().categoryFilter).toBeNull();
      });
    });

    describe('setSelectedItem', () => {
      it('should set the selected item', () => {
        const { setSelectedItem } = usePromptLibraryStore.getState();

        setSelectedItem(mockItem);

        expect(usePromptLibraryStore.getState().selectedItem).toEqual(mockItem);
      });

      it('should clear the selected item', () => {
        usePromptLibraryStore.setState({ selectedItem: mockItem });
        const { setSelectedItem } = usePromptLibraryStore.getState();

        setSelectedItem(null);

        expect(usePromptLibraryStore.getState().selectedItem).toBeNull();
      });
    });

    describe('openPicker / closePicker', () => {
      it('should open the picker', () => {
        const { openPicker } = usePromptLibraryStore.getState();

        openPicker();

        expect(usePromptLibraryStore.getState().isPickerOpen).toBe(true);
      });

      it('should close the picker', () => {
        usePromptLibraryStore.setState({ isPickerOpen: true });
        const { closePicker } = usePromptLibraryStore.getState();

        closePicker();

        expect(usePromptLibraryStore.getState().isPickerOpen).toBe(false);
      });
    });

    describe('openCreateModal / closeCreateModal', () => {
      it('should open the create modal', () => {
        const { openCreateModal } = usePromptLibraryStore.getState();

        openCreateModal();

        const state = usePromptLibraryStore.getState();
        expect(state.isCreateModalOpen).toBe(true);
        expect(state.editingItem).toBeNull();
      });

      it('should open the create modal with editing item', () => {
        const { openCreateModal } = usePromptLibraryStore.getState();

        openCreateModal(mockItem);

        const state = usePromptLibraryStore.getState();
        expect(state.isCreateModalOpen).toBe(true);
        expect(state.editingItem).toEqual(mockItem);
      });

      it('should close the create modal', () => {
        usePromptLibraryStore.setState({
          editingItem: mockItem,
          isCreateModalOpen: true,
        });
        const { closeCreateModal } = usePromptLibraryStore.getState();

        closeCreateModal();

        const state = usePromptLibraryStore.getState();
        expect(state.isCreateModalOpen).toBe(false);
        expect(state.editingItem).toBeNull();
      });
    });
  });

  describe('API Actions', () => {
    describe('loadItems', () => {
      it('should load items and update state', async () => {
        const { promptsApi } = await import('@/lib/api');
        vi.mocked(promptsApi.getAll).mockResolvedValueOnce([mockItem]);

        const { loadItems } = usePromptLibraryStore.getState();
        await loadItems();

        const state = usePromptLibraryStore.getState();
        expect(state.items).toEqual([mockItem]);
        expect(state.isLoading).toBe(false);
        expect(state.error).toBeNull();
      });

      it('should use search query and category filter', async () => {
        usePromptLibraryStore.setState({
          categoryFilter: 'landscape',
          searchQuery: 'sunset',
        });

        const { promptsApi } = await import('@/lib/api');
        const { loadItems } = usePromptLibraryStore.getState();
        await loadItems();

        expect(promptsApi.getAll).toHaveBeenCalledWith(
          expect.objectContaining({
            category: 'landscape',
            search: 'sunset',
          }),
          undefined
        );
      });

      it('should set error on failure', async () => {
        const { promptsApi } = await import('@/lib/api');
        vi.mocked(promptsApi.getAll).mockRejectedValueOnce(new Error('API Error'));

        const { loadItems } = usePromptLibraryStore.getState();
        await loadItems();

        const state = usePromptLibraryStore.getState();
        expect(state.error).toBe('API Error');
        expect(state.isLoading).toBe(false);
      });

      it('should ignore AbortError', async () => {
        const { promptsApi } = await import('@/lib/api');
        const abortError = new Error('Aborted');
        abortError.name = 'AbortError';
        vi.mocked(promptsApi.getAll).mockRejectedValueOnce(abortError);

        const { loadItems } = usePromptLibraryStore.getState();
        await loadItems();

        const state = usePromptLibraryStore.getState();
        expect(state.error).toBeNull();
      });
    });

    describe('loadFeatured', () => {
      it('should load featured items', async () => {
        const { promptsApi } = await import('@/lib/api');
        const featuredItem = { ...mockItem, isFeatured: true };
        vi.mocked(promptsApi.getFeatured).mockResolvedValueOnce([featuredItem]);

        const { loadFeatured } = usePromptLibraryStore.getState();
        await loadFeatured();

        expect(usePromptLibraryStore.getState().featuredItems).toEqual([featuredItem]);
      });
    });

    describe('createItem', () => {
      it('should create an item and add to list', async () => {
        const { promptsApi } = await import('@/lib/api');
        vi.mocked(promptsApi.create).mockResolvedValueOnce(mockItem);

        const { createItem } = usePromptLibraryStore.getState();
        const result = await createItem({
          name: mockItem.name,
          promptText: mockItem.promptText,
        });

        expect(result).toEqual(mockItem);
        const state = usePromptLibraryStore.getState();
        expect(state.items).toContainEqual(mockItem);
        expect(state.isCreateModalOpen).toBe(false);
      });

      it('should throw and set error on failure', async () => {
        const { promptsApi } = await import('@/lib/api');
        vi.mocked(promptsApi.create).mockRejectedValueOnce(new Error('Create failed'));

        const { createItem } = usePromptLibraryStore.getState();

        await expect(
          createItem({
            name: 'Test',
            promptText: 'Test prompt',
          })
        ).rejects.toThrow('Create failed');

        expect(usePromptLibraryStore.getState().error).toBe('Create failed');
      });
    });

    describe('updateItem', () => {
      it('should update an item in the list', async () => {
        usePromptLibraryStore.setState({ items: [mockItem] });
        const { promptsApi } = await import('@/lib/api');
        const updatedItem = { ...mockItem, name: 'Updated Name' };
        vi.mocked(promptsApi.update).mockResolvedValueOnce(updatedItem);

        const { updateItem } = usePromptLibraryStore.getState();
        const result = await updateItem('item-1', { name: 'Updated Name' });

        expect(result.name).toBe('Updated Name');
        const state = usePromptLibraryStore.getState();
        expect(state.items[0].name).toBe('Updated Name');
      });

      it('should update selected item if it was updated', async () => {
        usePromptLibraryStore.setState({
          items: [mockItem],
          selectedItem: mockItem,
        });
        const { promptsApi } = await import('@/lib/api');
        const updatedItem = { ...mockItem, name: 'Updated' };
        vi.mocked(promptsApi.update).mockResolvedValueOnce(updatedItem);

        const { updateItem } = usePromptLibraryStore.getState();
        await updateItem('item-1', { name: 'Updated' });

        expect(usePromptLibraryStore.getState().selectedItem?.name).toBe('Updated');
      });
    });

    describe('deleteItem', () => {
      it('should remove item from list', async () => {
        usePromptLibraryStore.setState({ items: [mockItem] });

        const { deleteItem } = usePromptLibraryStore.getState();
        await deleteItem('item-1');

        expect(usePromptLibraryStore.getState().items).toHaveLength(0);
      });

      it('should clear selected item if deleted', async () => {
        usePromptLibraryStore.setState({
          items: [mockItem],
          selectedItem: mockItem,
        });

        const { deleteItem } = usePromptLibraryStore.getState();
        await deleteItem('item-1');

        expect(usePromptLibraryStore.getState().selectedItem).toBeNull();
      });
    });

    describe('duplicateItem', () => {
      it('should add duplicated item to list', async () => {
        usePromptLibraryStore.setState({ items: [mockItem] });
        const { promptsApi } = await import('@/lib/api');
        const duplicatedItem = { ...mockItem, _id: 'item-2', name: 'Test Prompt (Copy)' };
        vi.mocked(promptsApi.duplicate).mockResolvedValueOnce(duplicatedItem);

        const { duplicateItem } = usePromptLibraryStore.getState();
        const result = await duplicateItem('item-1');

        expect(result._id).toBe('item-2');
        expect(usePromptLibraryStore.getState().items).toHaveLength(2);
      });
    });

    describe('recordItemUsage', () => {
      it('should update item use count and close picker', async () => {
        usePromptLibraryStore.setState({
          isPickerOpen: true,
          items: [mockItem],
        });
        const { promptsApi } = await import('@/lib/api');
        const usedItem = { ...mockItem, useCount: 6 };
        vi.mocked(promptsApi.use).mockResolvedValueOnce(usedItem);

        const { recordItemUsage } = usePromptLibraryStore.getState();
        const result = await recordItemUsage('item-1');

        expect(result.useCount).toBe(6);
        const state = usePromptLibraryStore.getState();
        expect(state.items[0].useCount).toBe(6);
        expect(state.isPickerOpen).toBe(false);
      });
    });
  });
});
