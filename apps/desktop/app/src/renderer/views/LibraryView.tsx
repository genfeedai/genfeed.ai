import type {
  IDesktopAsset,
  IDesktopGenerationJob,
  IDesktopGenerationProviderPublicConfig,
  IDesktopIngredient,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { DropZone } from '@renderer/components/DropZone';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useState } from 'react';

const PLATFORM_FILTERS = [
  { label: 'All', value: '' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Twitter', value: 'twitter' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'LinkedIn', value: 'linkedin' },
] as const;

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
        const assets = await window.genfeedDesktop.files.importAssets(
          workspaceId,
          paths,
        );
        await window.genfeedDesktop.notifications.notify(
          'Import Complete',
          `${String(assets.length)} asset(s) imported to workspace.`,
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
      <div className="view-header">
        <h2>Library</h2>
        <span className="muted-text">
          {ingredients.length} ingredients · {assets.length} assets
        </span>
      </div>

      <div className="panel-card">
        <div className="ingredient-header">
          <strong className="ingredient-title">Generate Image Asset</strong>
          {providerConfig && (
            <span className="platform-badge">
              {providerConfig.displayName ?? providerConfig.provider}
            </span>
          )}
        </div>
        <div className="library-filters">
          <Input
            className="input-field"
            disabled={!workspaceId || isGeneratingAsset}
            onChange={(event) => setAssetPrompt(event.target.value)}
            placeholder="Prompt"
            type="text"
            value={assetPrompt}
          />
          <Button
            disabled={
              !workspaceId ||
              !assetPrompt.trim() ||
              !providerConfig ||
              isGeneratingAsset
            }
            onClick={() => void handleGenerateAsset()}
            type="button"
            variant={ButtonVariant.DEFAULT}
          >
            {isGeneratingAsset ? 'Generating…' : 'Generate'}
          </Button>
        </div>
        {assetJob && (
          <p className="muted-text">
            Job {assetJob.status}
            {assetJob.assetIds.length > 0
              ? ` · ${assetJob.assetIds.length} asset`
              : ''}
          </p>
        )}
        {assetError && <div className="error-banner">{assetError}</div>}
      </div>

      {assets.length > 0 && (
        <div className="ingredient-grid">
          {assets.map((asset) => (
            <div className="ingredient-card panel-card" key={asset.id}>
              <div className="ingredient-header">
                <strong className="ingredient-title">
                  {asset.displayName}
                </strong>
                <span className="platform-badge">{asset.residency}</span>
              </div>
              <p className="ingredient-content">
                {asset.kind} · {asset.origin} · {asset.mimeType}
              </p>
              <div className="ingredient-footer">
                <span className="vote-count">
                  {Math.round(asset.sizeBytes / 1024)} KB
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="library-filters">
        <div className="pill-group">
          {PLATFORM_FILTERS.map((pf) => (
            <Button
              className={`pill-button ${platformFilter === pf.value ? 'pill-active' : ''}`}
              key={pf.value}
              onClick={() => setPlatformFilter(pf.value)}
              type="button"
              variant={ButtonVariant.UNSTYLED}
            >
              {pf.label}
            </Button>
          ))}
        </div>
        <div className="pill-group">
          <Button
            className={`pill-button ${sortBy === 'votes' ? 'pill-active' : ''}`}
            onClick={() => setSortBy('votes')}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            By Votes
          </Button>
          <Button
            className={`pill-button ${sortBy === 'date' ? 'pill-active' : ''}`}
            onClick={() => setSortBy('date')}
            type="button"
            variant={ButtonVariant.UNSTYLED}
          >
            By Date
          </Button>
        </div>
      </div>

      {loading && (
        <div className="skeleton-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="skeleton-card" key={`skel-${String(i)}`} />
          ))}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && sortedIngredients.length === 0 && (
        <p className="empty-state">
          No ingredients found. Try changing your filter or creating content in
          a conversation.
        </p>
      )}

      {!loading && sortedIngredients.length > 0 && (
        <div className="ingredient-grid">
          {sortedIngredients.map((ingredient) => (
            <div className="ingredient-card panel-card" key={ingredient.id}>
              <div className="ingredient-header">
                <strong className="ingredient-title">{ingredient.title}</strong>
                {ingredient.platform && (
                  <span className="platform-badge">{ingredient.platform}</span>
                )}
              </div>
              <p className="ingredient-content">{ingredient.content}</p>
              <div className="ingredient-footer">
                <span className="vote-count">▲ {ingredient.totalVotes}</span>
                <Button
                  className="small"
                  onClick={() => void handleCopy(ingredient)}
                  type="button"
                  variant={ButtonVariant.GHOST}
                >
                  {copiedId === ingredient.id ? '✓ Copied' : 'Copy'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </DropZone>
  );
};
