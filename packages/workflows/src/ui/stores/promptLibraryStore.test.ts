import type { IPrompt } from '@genfeedai/contracts/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PromptLibraryService } from '../provider/types';
import {
  configurePromptLibrary,
  usePromptLibraryStore,
} from './promptLibraryStore';

function makePrompt(overrides: Partial<IPrompt> = {}): IPrompt {
  return {
    id: 'prompt-1',
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

    const editItem = makePrompt({ id: 'edit-me' });
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
    const featured = [makePrompt({ id: 'featured-1' })];
    (api.getFeatured as ReturnType<typeof vi.fn>).mockResolvedValue(featured);
    configurePromptLibrary(api);

    await usePromptLibraryStore.getState().loadFeatured();

    expect(api.getFeatured).toHaveBeenCalledWith(10, undefined);
    expect(usePromptLibraryStore.getState().featuredItems).toEqual(featured);
  });

  it('createItem prepends the new item and closes the modal', async () => {
    const api = makeApi();
    const created = makePrompt({ id: 'new-1', name: 'New' });
    (api.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    configurePromptLibrary(api);
    usePromptLibraryStore.setState({ items: [makePrompt({ id: 'old' })] });

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

  it('setSelectedItem stores and clears the selection', () => {
    const item = makePrompt();
    usePromptLibraryStore.getState().setSelectedItem(item);
    expect(usePromptLibraryStore.getState().selectedItem).toEqual(item);

    usePromptLibraryStore.getState().setSelectedItem(null);
    expect(usePromptLibraryStore.getState().selectedItem).toBeNull();
  });

  it('openCreateModal with no argument opens a blank create form', () => {
    usePromptLibraryStore.setState({ editingItem: makePrompt() });
    usePromptLibraryStore.getState().openCreateModal();

    const state = usePromptLibraryStore.getState();
    expect(state.isCreateModalOpen).toBe(true);
    expect(state.editingItem).toBeNull();
  });

  it('loadItems lets an explicit query override the active filters', async () => {
    const api = makeApi();
    (api.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    configurePromptLibrary(api);

    usePromptLibraryStore.getState().setSearchQuery('sun');
    usePromptLibraryStore.getState().setCategoryFilter('portrait');
    await usePromptLibraryStore
      .getState()
      .loadItems({ category: 'landscape', search: 'moon' } as never);

    expect(api.getAll).toHaveBeenCalledWith(
      { category: 'landscape', search: 'moon' },
      undefined,
    );
  });

  it('loadItems omits search when no query and no active filter exist', async () => {
    const api = makeApi();
    (api.getAll as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    configurePromptLibrary(api);

    await usePromptLibraryStore.getState().loadItems();

    expect(api.getAll).toHaveBeenCalledWith(
      { category: undefined, search: undefined },
      undefined,
    );
  });

  it('duplicateItem prepends the copy', async () => {
    const api = makeApi();
    const copy = makePrompt({ id: 'prompt-1-copy', name: 'Sunset copy' });
    (api.duplicate as ReturnType<typeof vi.fn>).mockResolvedValue(copy);
    configurePromptLibrary(api);
    usePromptLibraryStore.setState({ items: [makePrompt()] });

    const result = await usePromptLibraryStore
      .getState()
      .duplicateItem('prompt-1');

    expect(result).toEqual(copy);
    expect(usePromptLibraryStore.getState().items[0]).toEqual(copy);
  });

  it('deleteItem keeps a selection that points at another item', async () => {
    const api = makeApi();
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    configurePromptLibrary(api);
    const other = makePrompt({ id: 'prompt-2' });
    usePromptLibraryStore.setState({
      items: [makePrompt(), other],
      selectedItem: other,
    });

    await usePromptLibraryStore.getState().deleteItem('prompt-1');

    const state = usePromptLibraryStore.getState();
    expect(state.items).toEqual([other]);
    expect(state.selectedItem).toEqual(other);
  });

  it('updateItem leaves an unrelated selection alone', async () => {
    const api = makeApi();
    const updated = makePrompt({ name: 'Renamed' });
    (api.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);
    configurePromptLibrary(api);
    const other = makePrompt({ id: 'prompt-2' });
    usePromptLibraryStore.setState({
      items: [makePrompt(), other],
      selectedItem: other,
    });

    await usePromptLibraryStore
      .getState()
      .updateItem('prompt-1', { name: 'Renamed' });

    expect(usePromptLibraryStore.getState().selectedItem).toEqual(other);
  });

  it('throws on the remaining write actions when no API is injected', async () => {
    await expect(
      usePromptLibraryStore.getState().updateItem('x', {}),
    ).rejects.toThrow('Prompt library not configured');
    await expect(
      usePromptLibraryStore.getState().duplicateItem('x'),
    ).rejects.toThrow('Prompt library not configured');
    await expect(
      usePromptLibraryStore.getState().recordItemUsage('x'),
    ).rejects.toThrow('Prompt library not configured');
  });
});

describe('usePromptLibraryStore — failure handling', () => {
  function rejectWith(name: string, message: string): Error {
    const error = new Error(message);
    error.name = name;
    return error;
  }

  it('loadItems records the error and stops loading', async () => {
    const api = makeApi();
    (api.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom'),
    );
    configurePromptLibrary(api);

    await usePromptLibraryStore.getState().loadItems();

    const state = usePromptLibraryStore.getState();
    expect(state.error).toBe('boom');
    expect(state.isLoading).toBe(false);
  });

  it('loadItems swallows aborts without surfacing an error', async () => {
    const api = makeApi();
    (api.getAll as ReturnType<typeof vi.fn>).mockRejectedValue(
      rejectWith('AbortError', 'aborted'),
    );
    configurePromptLibrary(api);

    await usePromptLibraryStore.getState().loadItems();

    const state = usePromptLibraryStore.getState();
    expect(state.error).toBeNull();
    // an aborted load never resolves, so the loading flag stays raised
    expect(state.isLoading).toBe(true);
  });

  it('loadFeatured swallows both real failures and aborts', async () => {
    const api = makeApi();
    (api.getFeatured as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('nope'),
    );
    configurePromptLibrary(api);

    await expect(
      usePromptLibraryStore.getState().loadFeatured(),
    ).resolves.toBeUndefined();
    expect(usePromptLibraryStore.getState().featuredItems).toEqual([]);

    (api.getFeatured as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      rejectWith('AbortError', 'aborted'),
    );
    await expect(
      usePromptLibraryStore.getState().loadFeatured(),
    ).resolves.toBeUndefined();
    expect(usePromptLibraryStore.getState().error).toBeNull();
  });

  it.each([
    ['createItem', 'create'],
    ['updateItem', 'update'],
    ['deleteItem', 'delete'],
    ['duplicateItem', 'duplicate'],
    ['recordItemUsage', 'use'],
  ] as const)('%s records the error and rethrows', async (action, method) => {
    const api = makeApi();
    (api[method] as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('server down'),
    );
    configurePromptLibrary(api);

    const store = usePromptLibraryStore.getState();
    const call =
      action === 'createItem'
        ? store.createItem({} as never)
        : action === 'updateItem'
          ? store.updateItem('prompt-1', {})
          : action === 'deleteItem'
            ? store.deleteItem('prompt-1')
            : action === 'duplicateItem'
              ? store.duplicateItem('prompt-1')
              : store.recordItemUsage('prompt-1');

    await expect(call).rejects.toThrow('server down');
    const state = usePromptLibraryStore.getState();
    expect(state.error).toBe('server down');
    expect(state.isLoading).toBe(false);
  });
});
