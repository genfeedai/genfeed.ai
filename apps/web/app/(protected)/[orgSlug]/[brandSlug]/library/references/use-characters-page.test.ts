import { paginatedResponse } from '@app-tests/paginated-response';
// @vitest-environment jsdom
import { IngredientStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCharactersPage } from './use-characters-page';

const navigation = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => navigation.searchParams,
}));

const mocks = vi.hoisted(() => {
  const composeSheetPrompt = vi.fn();
  const createFromSheet = vi.fn();
  const listCharactersPage = vi.fn();
  const postImage = vi.fn();
  const personasService = {
    composeSheetPrompt,
    createFromSheet,
    listCharactersPage,
  };
  const imagesService = { post: postImage };
  return {
    composeSheetPrompt,
    createFromSheet,
    getImagesService: async () => imagesService,
    getPersonasService: async () => personasService,
    listCharactersPage,
    postImage,
  };
});

vi.mock('next-intl', async () => {
  const { translateFromCatalog } = await import('@app-tests/next-intl.stub');
  const translate = translateFromCatalog('common.settings.characters');
  return {
    useTranslations: () => translate,
  };
});

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: () => ({
    brandId: 'brand-1',
    brands: [{ id: 'brand-1', label: 'Personal brand' }],
  }),
}));

vi.mock('@/hooks/auth/use-user-role/use-user-role', () => ({
  useUserRole: () => undefined,
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: (factory: (token: string) => unknown) => {
    const created = factory('test-token') as { listCharactersPage?: unknown };
    if (
      created &&
      typeof created === 'object' &&
      'listCharactersPage' in created
    ) {
      return mocks.getPersonasService;
    }
    return mocks.getImagesService;
  },
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

    const { result } = renderHook(() => useCharactersPage());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.characters).toHaveLength(1);
  });

  it('requests the server page named in the URL', async () => {
    navigation.searchParams = new URLSearchParams('page=2');

    const { result } = renderHook(() => useCharactersPage());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mocks.listCharactersPage).toHaveBeenCalledWith(
      { limit: ITEMS_PER_PAGE, page: 2 },
      expect.any(AbortSignal),
    );
  });

  it('generates a sheet and moves to the candidate step', async () => {
    const { result } = renderHook(() => useCharactersPage());

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
    const { result } = renderHook(() => useCharactersPage());

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
    const { result } = renderHook(() => useCharactersPage());

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
    const { result } = renderHook(() => useCharactersPage());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.applyReferences('p1', []);
    });
    expect(result.current.pageTotals).toEqual({ totalDocs: 61, totalPages: 5 });
    expect(result.current.characters[0].referenceIngredientIds).toEqual([]);
  });
});
