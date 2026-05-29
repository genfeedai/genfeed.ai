import type {
  IDesktopAsset,
  IDesktopGenerationJob,
  IDesktopGenerationProviderPublicConfig,
  IDesktopIngredient,
} from '@genfeedai/desktop-contracts';
import { DropZone } from '@renderer/components/DropZone';
import { useCallback, useEffect, useState } from 'react';
import { LibraryAssetGrid } from './LibraryAssetGrid';
import { LibraryFiltersBar } from './LibraryFiltersBar';
import { LibraryGeneratePanel } from './LibraryGeneratePanel';
import { LibraryIngredientsGrid } from './LibraryIngredientsGrid';
import { LibraryViewHeader } from './LibraryViewHeader';

type SortBy = 'date' | 'votes';

interface LibraryViewProps {
  workspaceId: string | null;
}

export const LibraryView = ({ workspaceId }: LibraryViewProps) => {
  const [assets, setAssets] = useState<IDesktopAsset[]>([]);
  const [assetPrompt, setAssetPrompt] = useState('');
  const [assetJob, setAssetJob] = useState<IDesktopGenerationJob | null>(null);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [isGeneratingAsset, setIsGeneratingAsset] = useState(false);
  const [ingredients, setIngredients] = useState<IDesktopIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [providerConfig, setProviderConfig] =
    useState<IDesktopGenerationProviderPublicConfig | null>(null);
  const [platformFilter, setPlatformFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('votes');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadIngredients = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.genfeedDesktop.cloud.getIngredients({
        limit: 20,
        platform: platformFilter || undefined,
      });
      setIngredients(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
    } finally {
      setLoading(false);
    }
  }, [platformFilter]);

  const loadAssets = useCallback(async () => {
    if (!workspaceId) {
      setAssets([]);
      return;
    }

    setAssets(await window.genfeedDesktop.files.listAssets(workspaceId));
  }, [workspaceId]);

  useEffect(() => {
    void loadIngredients();
  }, [loadIngredients]);

  useEffect(() => {
    void loadAssets().catch((err: unknown) => {
      setAssetError(
        err instanceof Error ? err.message : 'Failed to load assets',
      );
    });
  }, [loadAssets]);

  useEffect(() => {
    void window.genfeedDesktop.generation
      .getProviderConfig()
      .then(setProviderConfig)
      .catch(() => setProviderConfig(null));
  }, []);

  const sortedIngredients = ingredients.toSorted((a, b) => {
    if (sortBy === 'votes') return b.totalVotes - a.totalVotes;
    return 0;
  });

  const handleCopy = useCallback(async (ingredient: IDesktopIngredient) => {
    await navigator.clipboard.writeText(ingredient.content);
    setCopiedId(ingredient.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const handleFilesDropped = useCallback(
    async (paths: string[]) => {
      if (!workspaceId) return;
      try {
        const imported = await window.genfeedDesktop.files.importAssets(
          workspaceId,
          paths,
        );
        await window.genfeedDesktop.notifications.notify(
          'Import Complete',
          `${String(imported.length)} asset(s) imported to workspace.`,
        );
        await loadAssets();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import files');
      }
    },
    [loadAssets, workspaceId],
  );

  const handleGenerateAsset = useCallback(async () => {
    if (!workspaceId || !providerConfig) {
      return;
    }

    if (
      providerConfig.provider !== 'replicate' &&
      providerConfig.provider !== 'fal'
    ) {
      setAssetError(
        'Image asset generation currently supports Replicate and fal.ai.',
      );
      return;
    }

    setAssetError(null);
    setIsGeneratingAsset(true);

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
      setAssetJob(job);

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
        setAssetJob(latestJob);
      }

      if (latestJob.status === 'failed') {
        setAssetError(latestJob.error ?? 'Asset generation failed.');
      }

      await loadAssets();
    } catch (err) {
      setAssetError(
        err instanceof Error ? err.message : 'Asset generation failed.',
      );
    } finally {
      setIsGeneratingAsset(false);
    }
  }, [assetPrompt, loadAssets, providerConfig, workspaceId]);

  return (
    <DropZone
      className="view-library"
      onFilesDropped={(paths) => void handleFilesDropped(paths)}
    >
      <LibraryViewHeader
        assetCount={assets.length}
        ingredientCount={ingredients.length}
      />

      <LibraryGeneratePanel
        assetError={assetError}
        assetJob={assetJob}
        assetPrompt={assetPrompt}
        isGeneratingAsset={isGeneratingAsset}
        onGenerate={() => void handleGenerateAsset()}
        onPromptChange={setAssetPrompt}
        providerConfig={providerConfig}
        workspaceId={workspaceId}
      />

      <LibraryAssetGrid assets={assets} />

      <LibraryFiltersBar
        onPlatformChange={setPlatformFilter}
        onSortChange={setSortBy}
        platformFilter={platformFilter}
        sortBy={sortBy}
      />

      <LibraryIngredientsGrid
        copiedId={copiedId}
        error={error}
        ingredients={sortedIngredients}
        loading={loading}
        onCopy={(ingredient) => void handleCopy(ingredient)}
      />
    </DropZone>
  );
};
