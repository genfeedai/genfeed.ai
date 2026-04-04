import type {
  ICreatePrompt,
  IPrompt,
  IQueryPrompts,
  PromptCategory,
} from '@genfeedai/types';
import { create } from 'zustand';
import type { PromptLibraryService } from '../provider/types';

// =============================================================================
// Module-level API configuration
// =============================================================================

let _promptApi: PromptLibraryService | null = null;

/**
 * Configure the prompt library store with an API service.
 * Called by WorkflowUIProvider when a promptLibrary service is provided.
 *
 * This pattern is used because Zustand stores exist outside the React tree
 * and cannot use useContext directly.
 */
export function configurePromptLibrary(api: PromptLibraryService): void {
  _promptApi = api;
}

// =============================================================================
// Store
// =============================================================================

interface PromptLibraryStore {
  // State
  items: IPrompt[];
  featuredItems: IPrompt[];
  selectedItem: IPrompt | null;
  isLoading: boolean;
  error: string | null;

  // Filters
  searchQuery: string;
  categoryFilter: PromptCategory | null;

  // Quick picker state (for dropdown in nodes)
  isPickerOpen: boolean;

  // Modal state
  isCreateModalOpen: boolean;
  editingItem: IPrompt | null;

  // Actions - UI
  setSearchQuery: (query: string) => void;
  setCategoryFilter: (category: PromptCategory | null) => void;
  setSelectedItem: (item: IPrompt | null) => void;
  openPicker: () => void;
  closePicker: () => void;
  openCreateModal: (editItem?: IPrompt) => void;
  closeCreateModal: () => void;

  // Actions - API
  loadItems: (query?: IQueryPrompts, signal?: AbortSignal) => Promise<void>;
  loadFeatured: (signal?: AbortSignal) => Promise<void>;
  createItem: (data: ICreatePrompt, signal?: AbortSignal) => Promise<IPrompt>;
  updateItem: (
    id: string,
    data: Partial<ICreatePrompt>,
    signal?: AbortSignal,
  ) => Promise<IPrompt>;
  deleteItem: (id: string, signal?: AbortSignal) => Promise<void>;
  duplicateItem: (id: string, signal?: AbortSignal) => Promise<IPrompt>;
  recordItemUsage: (id: string, signal?: AbortSignal) => Promise<IPrompt>;
}

export const usePromptLibraryStore = create<PromptLibraryStore>((set, get) => ({
  categoryFilter: null,

  closeCreateModal: () =>
    set({
      editingItem: null,
      isCreateModalOpen: false,
    }),

  closePicker: () => set({ isPickerOpen: false }),

  createItem: async (data, signal) => {
    if (!_promptApi) throw new Error('Prompt library not configured');
    set({ error: null, isLoading: true });
    try {
      const item = await _promptApi.create(data, signal);
      set((state) => ({
        editingItem: null,
        isCreateModalOpen: false,
        isLoading: false,
        items: [item, ...state.items],
      }));
      return item;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },

  deleteItem: async (id, signal) => {
    if (!_promptApi) throw new Error('Prompt library not configured');
    try {
      await _promptApi.delete(id, signal);
      set((state) => ({
        items: state.items.filter((i) => i._id !== id),
        selectedItem:
          state.selectedItem?._id === id ? null : state.selectedItem,
      }));
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  duplicateItem: async (id, signal) => {
    if (!_promptApi) throw new Error('Prompt library not configured');
    try {
      const item = await _promptApi.duplicate(id, signal);
      set((state) => ({
        items: [item, ...state.items],
      }));
      return item;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },
  editingItem: null,
  error: null,
  featuredItems: [],
  isCreateModalOpen: false,
  isLoading: false,
  isPickerOpen: false,
  // Initial state
  items: [],

  loadFeatured: async (signal) => {
    if (!_promptApi) return;
    try {
      const featuredItems = await _promptApi.getFeatured(10, signal);
      set({ featuredItems });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        // Silently fail for featured items
      }
    }
  },

  // API Actions — all no-op if _promptApi is not configured
  loadItems: async (query, signal) => {
    if (!_promptApi) return;
    set({ error: null, isLoading: true });
    try {
      const { searchQuery, categoryFilter } = get();
      const finalQuery: IQueryPrompts = {
        ...query,
        category: query?.category ?? categoryFilter ?? undefined,
        search: query?.search ?? (searchQuery || undefined),
      };
      const items = await _promptApi.getAll(finalQuery, signal);
      set({ isLoading: false, items });
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        set({ error: (error as Error).message, isLoading: false });
      }
    }
  },

  openCreateModal: (editItem) =>
    set({
      editingItem: editItem ?? null,
      isCreateModalOpen: true,
    }),

  openPicker: () => set({ isPickerOpen: true }),

  recordItemUsage: async (id, signal) => {
    if (!_promptApi) throw new Error('Prompt library not configured');
    try {
      const item = await _promptApi.use(id, signal);
      set((state) => ({
        isPickerOpen: false,
        items: state.items.map((i) => (i._id === id ? item : i)),
      }));
      return item;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },
  searchQuery: '',
  selectedItem: null,

  setCategoryFilter: (category) => set({ categoryFilter: category }),

  // UI Actions
  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedItem: (item) => set({ selectedItem: item }),

  updateItem: async (id, data, signal) => {
    if (!_promptApi) throw new Error('Prompt library not configured');
    set({ error: null, isLoading: true });
    try {
      const item = await _promptApi.update(id, data, signal);
      set((state) => ({
        editingItem: null,
        isCreateModalOpen: false,
        isLoading: false,
        items: state.items.map((i) => (i._id === id ? item : i)),
        selectedItem:
          state.selectedItem?._id === id ? item : state.selectedItem,
      }));
      return item;
    } catch (error) {
      set({ error: (error as Error).message, isLoading: false });
      throw error;
    }
  },
}));
