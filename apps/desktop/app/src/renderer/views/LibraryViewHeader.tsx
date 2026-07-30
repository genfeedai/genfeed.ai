import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { Upload } from 'lucide-react';
import type { ReactElement } from 'react';

type LibraryViewHeaderProps = {
  ingredientCount: number;
  assetCount: number;
  canImport: boolean;
  isImporting: boolean;
  onImportAssets: () => void;
  workspaceName?: string;
};

export function LibraryViewHeader({
  ingredientCount,
  assetCount,
  canImport,
  isImporting,
  onImportAssets,
  workspaceName,
}: LibraryViewHeaderProps): ReactElement {
  return (
    <div className="view-header">
      <div>
        <h2>Library</h2>
        <span className="muted-text">
          {workspaceName ? `${workspaceName} · ` : ''}
          {ingredientCount} ingredients · {assetCount} assets
        </span>
      </div>
      <Button
        className="view-header-action"
        disabled={!canImport || isImporting}
        onClick={onImportAssets}
        type="button"
        variant={ButtonVariant.GHOST}
      >
        <Upload className="nav-icon-svg" />
        {isImporting ? 'Importing' : 'Import assets'}
      </Button>
    </div>
  );
}
