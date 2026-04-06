import type { IDesktopIngredient } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { DropZone } from '@renderer/components/DropZone';
import { Button } from '@ui/primitives/button';
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
  const [ingredients, setIngredients] = useState<IDesktopIngredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    void loadIngredients();
  }, [loadIngredients]);

  const sortedIngredients = [...ingredients].sort((a, b) => {
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
        await window.genfeedDesktop.files.importAssets(workspaceId, paths);
        await window.genfeedDesktop.notifications.notify(
          'Import Complete',
          `${String(paths.length)} file(s) imported to workspace.`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to import files');
      }
    },
    [workspaceId],
  );

  return (
    <DropZone
      className="view-library"
      onFilesDropped={(paths) => void handleFilesDropped(paths)}
    >
      <div className="view-header">
        <h2>Library</h2>
        <span className="muted-text">{ingredients.length} ingredients</span>
      </div>

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
