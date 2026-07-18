import type {
  IDesktopAsset,
  IDesktopGenerationJob,
  IDesktopGenerationProviderPublicConfig,
  IDesktopIngredient,
  IDesktopWorkspace,
} from '@genfeedai/desktop-contracts';
import { DropZone } from '@renderer/components/DropZone';
import { useCallback, useEffect, useReducer } from 'react';
import { LibraryAssetGrid } from './LibraryAssetGrid';
import { LibraryFiltersBar } from './LibraryFiltersBar';
import { LibraryGeneratePanel } from './LibraryGeneratePanel';
import { LibraryIngredientsGrid } from './LibraryIngredientsGrid';
import { LibraryViewHeader } from './LibraryViewHeader';

type SortBy = 'date' | 'votes';

interface LibraryViewProps {
  isCloudConnected: boolean;
  isOnline: boolean;
  workspace: IDesktopWorkspace | null;
  workspaceId: string | null;
}

type LibraryState = {
  assets: IDesktopAsset[];
  assetPrompt: string;
  assetJob: IDesktopGenerationJob | null;
  assetError: string | null;
  isGeneratingAsset: boolean;
  isImportingAsset: boolean;
  ingredients: IDesktopIngredient[];
  isLoading: boolean;
  error: string | null;
  providerConfig: IDesktopGenerationProviderPublicConfig | null;
  platformFilter: string;
  sortBy: SortBy;
  copiedId: string | null;
};

type LibraryAction =
  | { type: 'SET_ASSETS'; payload: IDesktopAsset[] }
  | { type: 'SET_ASSET_PROMPT'; payload: string }
  | { type: 'SET_ASSET_JOB'; payload: IDesktopGenerationJob | null }
  | { type: 'SET_ASSET_ERROR'; payload: string | null }
  | { type: 'SET_INGREDIENTS'; payload: IDesktopIngredient[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | {
      type: 'SET_PROVIDER_CONFIG';
      payload: IDesktopGenerationProviderPublicConfig | null;
    }
  | { type: 'SET_PLATFORM_FILTER'; payload: string }
  | { type: 'SET_SORT_BY'; payload: SortBy }
  | { type: 'SET_COPIED_ID'; payload: string | null }
  | {
      type: 'INGREDIENTS_LOADED';
      payload: { ingredients: IDesktopIngredient[] };
    }
  | { type: 'INGREDIENTS_LOAD_FAILED'; payload: string }
  | { type: 'ASSET_GENERATION_START' }
  | {
      type: 'ASSET_GENERATION_DONE';
      payload: { error: string | null };
    }
  | { type: 'IMPORT_START' }
  | { type: 'IMPORT_DONE'; payload: { error: string | null } };

const initialState: LibraryState = {
  assets: [],
  assetPrompt: '',
  assetJob: null,
  assetError: null,
  isGeneratingAsset: false,
  isImportingAsset: false,
  ingredients: [],
  isLoading: true,
  error: null,
  providerConfig: null,
  platformFilter: '',
  sortBy: 'votes',
  copiedId: null,
};

function libraryReducer(
  state: LibraryState,
  action: LibraryAction,
): LibraryState {
  switch (action.type) {
    case 'SET_ASSETS':
      return { ...state, assets: action.payload };
    case 'SET_ASSET_PROMPT':
      return { ...state, assetPrompt: action.payload };
    case 'SET_ASSET_JOB':
      return { ...state, assetJob: action.payload };
    case 'SET_ASSET_ERROR':
      return { ...state, assetError: action.payload };
    case 'SET_INGREDIENTS':
      return { ...state, ingredients: action.payload };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_PROVIDER_CONFIG':
      return { ...state, providerConfig: action.payload };
    case 'SET_PLATFORM_FILTER':
      return { ...state, platformFilter: action.payload };
    case 'SET_SORT_BY':
      return { ...state, sortBy: action.payload };
    case 'SET_COPIED_ID':
      return { ...state, copiedId: action.payload };
    case 'INGREDIENTS_LOADED':
      return {
        ...state,
        ingredients: action.payload.ingredients,
        isLoading: false,
        error: null,
      };
    case 'INGREDIENTS_LOAD_FAILED':
      return { ...state, isLoading: false, error: action.payload };
    case 'ASSET_GENERATION_START':
      return { ...state, assetError: null, isGeneratingAsset: true };
    case 'ASSET_GENERATION_DONE':
      return {
        ...state,
        isGeneratingAsset: false,
        assetError: action.payload.error,
      };
    case 'IMPORT_START':
      return { ...state, isImportingAsset: true, error: null };
    case 'IMPORT_DONE':
      return {
        ...state,
        isImportingAsset: false,
        error: action.payload.error,
      };
    default:
      return state;
  }
}

export const LibraryView = ({
  isCloudConnected,
  isOnline,
  workspace,
  workspaceId,
}: LibraryViewProps) => {
  const [state, dispatch] = useReducer(libraryReducer, initialState);
  const hasDataAccess = isOnline || !isCloudConnected;

  const {
    assets,
    assetPrompt,
    assetJob,
    assetError,
    isGeneratingAsset,
    isImportingAsset,
    ingredients,
    isLoading: loading,
    error,
    providerConfig,
    platformFilter,
    sortBy,
    copiedId,
  } = state;

  const loadIngredients = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });

    if (!hasDataAccess) {
      dispatch({ type: 'SET_INGREDIENTS', payload: [] });
      dispatch({ type: 'SET_LOADING', payload: false });
      return;
    }

    try {
      const result = await window.genfeedDesktop.cloud.getIngredients({
        limit: 20,
        platform: platformFilter || undefined,
      });
      dispatch({
        type: 'INGREDIENTS_LOADED',
        payload: { ingredients: result },
      });
    } catch (err) {
      dispatch({
        type: 'INGREDIENTS_LOAD_FAILED',
        payload: err instanceof Error ? err.message : 'Failed to load library',
      });
    }
  }, [hasDataAccess, platformFilter]);

  const loadAssets = useCallback(async () => {
    if (!workspaceId) {
      dispatch({ type: 'SET_ASSETS', payload: [] });
      return;
    }

    dispatch({
      type: 'SET_ASSETS',
      payload: await window.genfeedDesktop.files.listAssets(workspaceId),
    });
  }, [workspaceId]);

  useEffect(() => {
    void loadIngredients();
  }, [loadIngredients]);

  useEffect(() => {
    void loadAssets().catch((err: unknown) => {
      dispatch({
        type: 'SET_ASSET_ERROR',
        payload: err instanceof Error ? err.message : 'Failed to load assets',
      });
    });
  }, [loadAssets]);

  useEffect(() => {
    void window.genfeedDesktop.generation
      .getProviderConfig()
      .then((cfg) => dispatch({ type: 'SET_PROVIDER_CONFIG', payload: cfg }))
      .catch(() => dispatch({ type: 'SET_PROVIDER_CONFIG', payload: null }));
  }, []);

  const sortedIngredients = ingredients.toSorted((a, b) => {
    if (sortBy === 'votes') return b.totalVotes - a.totalVotes;
    return 0;
  });

  const handleCopy = useCallback(async (ingredient: IDesktopIngredient) => {
    await navigator.clipboard.writeText(ingredient.content);
    dispatch({ type: 'SET_COPIED_ID', payload: ingredient.id });
    setTimeout(() => dispatch({ type: 'SET_COPIED_ID', payload: null }), 2000);
  }, []);

  const importWorkspaceAssets = useCallback(
    async (paths?: string[]) => {
      if (!workspaceId) return;

      dispatch({ type: 'IMPORT_START' });

      try {
        const imported = await window.genfeedDesktop.files.importAssets(
          workspaceId,
          paths,
        );
        if (imported.length === 0) {
          dispatch({ type: 'IMPORT_DONE', payload: { error: null } });
          return;
        }
        await window.genfeedDesktop.notifications.notify(
          'Import Complete',
          `${String(imported.length)} asset(s) imported to workspace.`,
        );
        await loadAssets();
        dispatch({ type: 'IMPORT_DONE', payload: { error: null } });
      } catch (err) {
        dispatch({
          type: 'IMPORT_DONE',
          payload: {
            error:
              err instanceof Error ? err.message : 'Failed to import files',
          },
        });
      }
    },
    [loadAssets, workspaceId],
  );

  const handleFilesDropped = useCallback(
    async (paths: string[]) => {
      await importWorkspaceAssets(paths);
    },
    [importWorkspaceAssets],
  );

  const handleRevealAsset = useCallback(async (assetId: string) => {
    try {
      dispatch({ type: 'SET_ASSET_ERROR', payload: null });
      await window.genfeedDesktop.files.revealAsset(assetId);
    } catch (err) {
      dispatch({
        type: 'SET_ASSET_ERROR',
        payload: err instanceof Error ? err.message : 'Failed to reveal asset.',
      });
    }
  }, []);

  const handleGenerateAsset = useCallback(async () => {
    if (!workspaceId || !providerConfig) {
      return;
    }

    if (
      providerConfig.provider !== 'replicate' &&
      providerConfig.provider !== 'fal'
    ) {
      dispatch({
        type: 'SET_ASSET_ERROR',
        payload:
          'Image asset generation currently supports Replicate and fal.ai.',
      });
      return;
    }

    dispatch({ type: 'ASSET_GENERATION_START' });

    try {
      const job = await window.genfeedDesktop.generation.enqueueAssetGeneration(
        {
          model: providerConfig.model,
          prompt: assetPrompt,
          provider: providerConfig.provider,
          uploadPolicy: 'never',
          workspaceId,
        },
      );
      dispatch({ type: 'SET_ASSET_JOB', payload: job });

      let latestJob = job;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        if (
          latestJob.status === 'succeeded' ||
          latestJob.status === 'failed' ||
          latestJob.status === 'cancelled'
        ) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
        latestJob =
          (await window.genfeedDesktop.generation.getGenerationJob(job.id)) ??
          latestJob;
        dispatch({ type: 'SET_ASSET_JOB', payload: latestJob });
      }

      const generationError =
        latestJob.status === 'failed'
          ? (latestJob.error ?? 'Asset generation failed.')
          : null;

      dispatch({
        type: 'ASSET_GENERATION_DONE',
        payload: { error: generationError },
      });

      await loadAssets();
    } catch (err) {
      dispatch({
        type: 'ASSET_GENERATION_DONE',
        payload: {
          error:
            err instanceof Error ? err.message : 'Asset generation failed.',
        },
      });
    }
  }, [assetPrompt, loadAssets, providerConfig, workspaceId]);

  return (
    <DropZone
      className="view-library"
      onFilesDropped={(paths) => void handleFilesDropped(paths)}
    >
      <LibraryViewHeader
        assetCount={assets.length}
        canImport={Boolean(workspaceId)}
        ingredientCount={ingredients.length}
        isImporting={isImportingAsset}
        onImportAssets={() => void importWorkspaceAssets()}
        workspaceName={workspace?.name}
      />

      <LibraryGeneratePanel
        assetError={assetError}
        assetJob={assetJob}
        assetPrompt={assetPrompt}
        isGeneratingAsset={isGeneratingAsset}
        onGenerate={() => void handleGenerateAsset()}
        onPromptChange={(prompt) =>
          dispatch({ type: 'SET_ASSET_PROMPT', payload: prompt })
        }
        providerConfig={providerConfig}
        workspaceId={workspaceId}
      />

      <LibraryAssetGrid
        assets={assets}
        onRevealAsset={(assetId) => void handleRevealAsset(assetId)}
      />

      <LibraryFiltersBar
        onPlatformChange={(filter) =>
          dispatch({ type: 'SET_PLATFORM_FILTER', payload: filter })
        }
        onSortChange={(sort) =>
          dispatch({ type: 'SET_SORT_BY', payload: sort })
        }
        platformFilter={platformFilter}
        sortBy={sortBy}
      />

      <LibraryIngredientsGrid
        copiedId={copiedId}
        error={error}
        ingredients={sortedIngredients}
        isOnline={hasDataAccess}
        loading={loading}
        onRetry={() => void loadIngredients()}
        onCopy={(ingredient) => void handleCopy(ingredient)}
      />
    </DropZone>
  );
};
