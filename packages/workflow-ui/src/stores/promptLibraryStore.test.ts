import type { IPrompt } from '@genfeedai/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptLibraryService } from '../provider/types';
import {
  configurePromptLibrary,
  usePromptLibraryStore,
} from './promptLibraryStore';

function makePrompt(overrides: Partial<IPrompt> = {}): IPrompt {
  return {
    _id: 'prompt-1',
    category: 'portrait',
    content: 'A prompt',
    name: 'Sunset',
    ...overrides,
  } as IPrompt;
}

function makeApi(): PromptLibraryService {
  return {
    create: vi.fn(),
    delete: vi.fn(),
    duplicate: vi.fn(),
    getAll: vi.fn(),
    getFeatured: vi.fn(),
    update: vi.fn(),
    use: vi.fn(),
  };
}

const INITIAL_STATE = usePromptLibraryStore.getState();

beforeEach(() => {
  // Reset store + clear the module-level injected API between tests.
  usePromptLibraryStore.setState(INITIAL_STATE, true);
  configurePromptLibrary(undefined as unknown as PromptLibraryService);
});

describe('usePromptLibraryStore — UI actions', () => {
  it('updates search query and category filter', () => {
    usePromptLibraryStore.getState().setSearchQuery('sunset');
    usePromptLibraryStore.getState().setCategoryFilter('portrait');

    const state = usePromptLibraryStore.getState();
    expect(state.searchQuery).toBe('sunset');
    expect(state.categoryFilter).toBe('portrait');
  });

  it('toggles picker and create-modal state', () => {
    usePromptLibraryStore.getState().openPicker();
    expect(usePromptLibraryStore.getState().isPickerOpen).toBe(true);
    usePromptLibraryStore.getState().closePicker();
    expect(usePromptLibraryStore.getState().isPickerOpen).toBe(false);

    const editItem = makePrompt({ _id: 'edit-me' });
    usePromptLibraryStore.getState().openCreateModal(editItem);
    let state = usePromptLibraryStore.getState();
    expect(state.isCreateModalOpen).toBe(true);
    expect(state.editingItem).toEqual(editItem);

    usePromptLibraryStore.getState().closeCreateModal();
    state = usePromptLibraryStore.getState();
    expect(state.isCreateModalOpen).toBe(false);
    expect(state.editingItem).toBeNull();
  });
});

describe('usePromptLibraryStore — not configured', () => {
  it('no-ops read actions when no API is injected', async () => {
    await usePromptLibraryStore.getState().loadItems();
    await usePromptLibraryStore.getState().loadFeatured();

    const state = usePromptLibraryStore.getState();
    expect(state.items).toEqual([]);
    expect(state.featuredItems).toEqual([]);
  });

  it('throws on write actions when no API is injected', async () => {
    await expect(
      usePromptLibraryStore.getState().createItem({} as never),
    ).rejects.toThrow('Prompt library not configured');
    await expect(
      usePromptLibraryStore.getState().deleteItem('x'),
    ).rejects.toThrow('Prompt library not configured');
  });
});

describe('usePromptLibraryStore — CRUD via injected API', () => {
  it('loadItems merges filters and stores results', async () => {
    const api = makeApi();
    const items = [makePrompt()];
    (api.getAll as ReturnType<typeof vi.fn>).mockResolvedValue(items);
    configurePromptLibrary(api);

    usePromptLibraryStore.getState().setSearchQuery('sun');
    usePromptLibraryStore.getState().setCategoryFilter('portrait');
    await usePromptLibraryStore.getState().loadItems();

    expect(api.getAll).toHaveBeenCalledWith(
      { category: 'portrait', search: 'sun' },
      undefined,
    );
    expect(usePromptLibraryStore.getState().items).toEqual(items);
    expect(usePromptLibraryStore.getState().isLoading).toBe(false);
  });

  it('loadFeatured stores featured items', async () => {
    const api = makeApi();
    const featured = [makePrompt({ _id: 'featured-1' })];
    (api.getFeatured as ReturnType<typeof vi.fn>).mockResolvedValue(featured);
    configurePromptLibrary(api);

    await usePromptLibraryStore.getState().loadFeatured();

    expect(api.getFeatured).toHaveBeenCalledWith(10, undefined);
    expect(usePromptLibraryStore.getState().featuredItems).toEqual(featured);
  });

  it('createItem prepends the new item and closes the modal', async () => {
    const api = makeApi();
    const created = makePrompt({ _id: 'new-1', name: 'New' });
    (api.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    configurePromptLibrary(api);
    usePromptLibraryStore.setState({ items: [makePrompt({ _id: 'old' })] });

    const result = await usePromptLibraryStore
      .getState()
      .createItem({ name: 'New' } as never);

    expect(result).toEqual(created);
    const state = usePromptLibraryStore.getState();
    expect(state.items[0]).toEqual(created);
    expect(state.isCreateModalOpen).toBe(false);
  });

  it('updateItem replaces the item in place and syncs selection', async () => {
    const api = makeApi();
    const updated = makePrompt({ name: 'Renamed' });
    (api.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);
    configurePromptLibrary(api);
    usePromptLibraryStore.setState({
      items: [makePrompt()],
      selectedItem: makePrompt(),
    });

    await usePromptLibraryStore
      .getState()
      .updateItem('prompt-1', { name: 'Renamed' });

    const state = usePromptLibraryStore.getState();
    expect(state.items[0].name).toBe('Renamed');
    expect(state.selectedItem?.name).toBe('Renamed');
  });

  it('deleteItem removes the item and clears selection', async () => {
    const api = makeApi();
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    configurePromptLibrary(api);
    usePromptLibraryStore.setState({
      items: [makePrompt()],
      selectedItem: makePrompt(),
    });

    await usePromptLibraryStore.getState().deleteItem('prompt-1');

    const state = usePromptLibraryStore.getState();
    expect(state.items).toHaveLength(0);
    expect(state.selectedItem).toBeNull();
  });

  it('recordItemUsage updates the item and closes the picker', async () => {
    const api = makeApi();
    const used = makePrompt({ name: 'Used' });
    (api.use as ReturnType<typeof vi.fn>).mockResolvedValue(used);
    configurePromptLibrary(api);
    usePromptLibraryStore.setState({
      isPickerOpen: true,
      items: [makePrompt()],
    });

    await usePromptLibraryStore.getState().recordItemUsage('prompt-1');

    const state = usePromptLibraryStore.getState();
    expect(state.items[0].name).toBe('Used');
    expect(state.isPickerOpen).toBe(false);
  });
});
