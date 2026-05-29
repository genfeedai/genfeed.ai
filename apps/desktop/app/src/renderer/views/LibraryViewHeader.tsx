import type { ReactElement } from 'react';

type LibraryViewHeaderProps = {
  ingredientCount: number;
  assetCount: number;
};

export function LibraryViewHeader({
  ingredientCount,
  assetCount,
}: LibraryViewHeaderProps): ReactElement {
  return (
    <div className="view-header">
      <h2>Library</h2>
      <span className="muted-text">
        {ingredientCount} ingredients · {assetCount} assets
      </span>
    </div>
  );
}
