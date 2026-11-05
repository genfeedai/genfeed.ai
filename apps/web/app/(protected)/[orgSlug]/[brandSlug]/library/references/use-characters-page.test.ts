// @vitest-environment jsdom
import { paginatedResponse } from '@app-tests/paginated-response';
import {
  createTestQueryClient,
  queryClientWrapper,
} from '@app-tests/query-client.harness';
import { IngredientStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCharactersPage } from './use-characters-page';

const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
}));

const mocks = vi.hoisted(() => ({
  brand: {
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Personal brand' }],
    organizationId: 'org-1',
  },
  composeSheetPrompt: vi.fn(),
  createFromSheet: vi.fn(),
  listCharactersPage: vi.fn(),
  postImage: vi.fn(),
}));

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const translate = translateFromCatalog('common.settings.characters');
  return {
    useTranslations: () => translate,
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mocks.brand,
}));

vi.mock('@/hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => undefined,
}));

vi.mock('@hooks/auth/use-auth-identity/use-auth-identity', async () => ({
  useAuthIdentity: (await import('@app-tests/query-client.harness'))
    .useTestViewer,
}));

vi.mock('@hooks/utils/use-socket-manager/use-socket-manager', () => ({
  useSocketManager: () => ({ subscribe: vi.fn(() => vi.fn()) }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    ingredientsEndpoint: 'https://cdn.test/ingredients',
  },
}));

vi.mock('@services/core/logger.service', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

vi.mock('@services/core/notifications.service', () => ({
  NotificationsService: {
    getInstance: () => ({
      error: vi.fn(),
      success: vi.fn(),
      warning: vi.fn(),
    }),
  },
}));

vi.mock('@services/core/socket-manager.service', () => ({
  createMediaHandler: vi.fn(),
}));

vi.mock('@services/content/personas.service', () => ({
  PersonasService: {
    getInstance: () => ({
      composeSheetPrompt: mocks.composeSheetPrompt,
      createFromSheet: mocks.createFromSheet,
      listCharactersPage: mocks.listCharactersPage,
    }),
  },
}));

vi.mock('@services/ingredients/images.service', () => ({
  ImagesService: {
    getInstance: () => ({
      post: mocks.postImage,
    }),
  },
}));

describe('useCharactersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    navigation.searchParams = new URLSearchParams();
    mocks.brand = {
      brandId: 'brand-1',
      brands: [{ id: 'brand-1', label: 'Personal brand' }],
      organizationId: 'org-1',
    };
    mocks.listCharactersPage.mockResolvedValue(paginatedResponse([]));
    mocks.composeSheetPrompt.mockResolvedValue({
      prompt: 'CHARACTER REFERENCE SHEET PRESET v1.0.0',
    });
    mocks.postImage.mockResolvedValue({
      id: 'img-1',
      status: IngredientStatus.GENERATED,
      url: 'https://cdn.test/img-1.jpg',
    });
    mocks.createFromSheet.mockResolvedValue({
      handle: 'anna',
      id: 'p1',
      label: 'Anna',
    });
  });

  it('loads characters on mount', async () => {
    mocks.listCharactersPage.mockResolvedValue(
      paginatedResponse([
        { avatarIngredientId: null, handle: 'anna', id: 'p1', label: 'Anna' },
      ]),
    );

    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.characters).toHaveLength(1);
  });

  it('requests the server page named in the URL', async () => {
    navigation.searchParams = new URLSearchParams('page=2');

    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.listCharactersPage).toHaveBeenCalledWith(
      { limit: ITEMS_PER_PAGE, page: 2 },
      expect.any(AbortSignal),
    );
  });

  it('generates a sheet and moves to the candidate step', async () => {
    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.create.setDescription('a tall woman');
    });

    await act(async () => {
      await result.current.generateSheet();
    });

    expect(mocks.composeSheetPrompt).toHaveBeenCalledWith({
      description: 'a tall woman',
      isNonHumanoid: false,
    });
    expect(result.current.step).toBe('candidate');
    expect(result.current.candidate?.id).toBe('img-1');
  });

  it('creates a character and resets the create form', async () => {
    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.create.setDescription('a tall woman');
    });
    await act(async () => {
      await result.current.generateSheet();
    });

    act(() => {
      result.current.approveCandidate();
    });
    expect(result.current.step).toBe('approve');

    act(() => {
      result.current.approve.setLabel('Anna');
      result.current.approve.setHandle('anna');
    });

    await act(async () => {
      await result.current.createCharacter();
    });

    expect(mocks.createFromSheet).toHaveBeenCalledWith({
      assetId: 'img-1',
      handle: 'anna',
      label: 'Anna',
    });
    expect(result.current.step).toBe('describe');
    expect(result.current.isCreateDialogOpen).toBe(false);
  });

  it('closing the dialog discards the in-progress candidate', async () => {
    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.openCreateDialog();
      result.current.create.setDescription('a tall woman');
    });

    await act(async () => {
      await result.current.generateSheet();
    });
    expect(result.current.step).toBe('candidate');

    act(() => {
      result.current.setIsCreateDialogOpen(false);
    });

    expect(result.current.step).toBe('describe');
    expect(result.current.candidate).toBeNull();
    expect(result.current.isCreateDialogOpen).toBe(false);
  });
  it('preserves the page totals when references are edited locally', async () => {
    mocks.listCharactersPage.mockResolvedValue(
      paginatedResponse(
        [{ avatarIngredientId: null, handle: 'anna', id: 'p1', label: 'Anna' }],
        { totalDocs: 61, totalPages: 5 },
      ),
    );
    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.applyReferences('p1', []);
    });
    await waitFor(() =>
      expect(result.current.characters[0].referenceIngredientIds).toEqual([]),
    );
    expect(result.current.pageTotals).toEqual({ totalDocs: 61, totalPages: 5 });
  });

  it('paints the cached characters at once when the page is opened again', async () => {
    mocks.listCharactersPage.mockResolvedValue(
      paginatedResponse(
        [{ avatarIngredientId: null, handle: 'anna', id: 'p1', label: 'Anna' }],
        { totalDocs: 16, totalPages: 2 },
      ),
    );
    const client = createTestQueryClient();
    const first = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.characters[0]?.label).toBe('Anna'),
    );
    first.unmount();

    mocks.listCharactersPage.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.characters[0]?.label).toBe('Anna');
    expect(result.current.pageTotals).toEqual({ totalDocs: 16, totalPages: 2 });
  });

  it('never shows another brand the characters cached for this one', async () => {
    mocks.listCharactersPage.mockResolvedValue(
      paginatedResponse([
        { avatarIngredientId: null, handle: 'anna', id: 'p1', label: 'Anna' },
      ]),
    );
    const client = createTestQueryClient();
    const first = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(client),
    });
    await waitFor(() =>
      expect(first.result.current.characters).toHaveLength(1),
    );
    first.unmount();

    mocks.brand = { ...mocks.brand, brandId: 'brand-2' };
    mocks.listCharactersPage.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(client),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.characters).toEqual([]);
  });

  it('keeps the current rows on screen while the next page loads', async () => {
    mocks.listCharactersPage.mockResolvedValue(
      paginatedResponse([
        { avatarIngredientId: null, handle: 'anna', id: 'p1', label: 'Anna' },
      ]),
    );
    const { result, rerender } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.characters).toHaveLength(1));

    mocks.listCharactersPage.mockReturnValue(new Promise(() => undefined));
    navigation.searchParams = new URLSearchParams('page=2');
    rerender();

    await waitFor(() =>
      expect(mocks.listCharactersPage).toHaveBeenLastCalledWith(
        { limit: ITEMS_PER_PAGE, page: 2 },
        expect.any(AbortSignal),
      ),
    );
    expect(result.current.isLoading).toBe(false);
    expect(result.current.characters[0]?.label).toBe('Anna');
  });

  it('re-reads the list after a character is created', async () => {
    const { result } = renderHook(() => useCharactersPage(), {
      wrapper: queryClientWrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    mocks.listCharactersPage.mockResolvedValue(
      paginatedResponse([
        { avatarIngredientId: null, handle: 'anna', id: 'p1', label: 'Anna' },
      ]),
    );

    act(() => {
      result.current.create.setDescription('a tall woman');
    });
    await act(async () => {
      await result.current.generateSheet();
    });
    act(() => {
      result.current.approveCandidate();
      result.current.approve.setLabel('Anna');
      result.current.approve.setHandle('anna');
    });
    await act(async () => {
      await result.current.createCharacter();
    });

    await waitFor(() =>
      expect(result.current.characters[0]?.label).toBe('Anna'),
    );
  });
});
