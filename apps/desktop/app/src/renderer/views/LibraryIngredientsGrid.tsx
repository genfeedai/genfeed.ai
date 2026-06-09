import type { IDesktopIngredient } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { DesktopResilienceState } from '@renderer/components/DesktopResilienceState';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

type LibraryIngredientsGridProps = {
  loading: boolean;
  error: string | null;
  ingredients: IDesktopIngredient[];
  isOnline: boolean;
  copiedId: string | null;
  onCopy: (ingredient: IDesktopIngredient) => void;
  onRetry: () => void;
};

export function LibraryIngredientsGrid({
  loading,
  error,
  ingredients,
  isOnline,
  copiedId,
  onCopy,
  onRetry,
}: LibraryIngredientsGridProps): ReactElement {
  return (
    <>
      {loading && (
        <div className="skeleton-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div className="skeleton-card" key={`skel-${String(i)}`} />
          ))}
        </div>
      )}

      {!loading && !isOnline && (
        <DesktopResilienceState
          actionLabel="Retry"
          details="Cloud ingredient search needs a connection. Local workspace assets remain available above."
          kind="offline"
          onAction={onRetry}
          title="Ingredient search is offline"
        />
      )}

      {!loading && isOnline && error && (
        <DesktopResilienceState
          actionLabel="Retry"
          details={error}
          kind="error"
          onAction={onRetry}
          title="Unable to load ingredients"
        />
      )}

      {!loading && isOnline && !error && ingredients.length === 0 && (
        <DesktopResilienceState
          details="No ingredients matched this filter. Try another platform or create content in a conversation."
          kind="empty"
          title="No ingredients found"
        />
      )}

      {!loading && isOnline && !error && ingredients.length > 0 && (
        <div className="ingredient-grid">
          {ingredients.map((ingredient) => (
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
                  onClick={() => onCopy(ingredient)}
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
    </>
  );
}
