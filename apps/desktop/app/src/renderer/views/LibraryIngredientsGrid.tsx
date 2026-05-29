import type { IDesktopIngredient } from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';

type LibraryIngredientsGridProps = {
  loading: boolean;
  error: string | null;
  ingredients: IDesktopIngredient[];
  copiedId: string | null;
  onCopy: (ingredient: IDesktopIngredient) => void;
};

export function LibraryIngredientsGrid({
  loading,
  error,
  ingredients,
  copiedId,
  onCopy,
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

      {error && <div className="error-banner">{error}</div>}

      {!loading && !error && ingredients.length === 0 && (
        <p className="empty-state">
          No ingredients found. Try changing your filter or creating content in
          a conversation.
        </p>
      )}

      {!loading && ingredients.length > 0 && (
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
