import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import type { ReactElement } from 'react';
import { HiOutlineArrowUpTray } from 'react-icons/hi2';

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
        <HiOutlineArrowUpTray className="nav-icon-svg" />
        {isImporting ? 'Importing' : 'Import assets'}
      </Button>
    </div>
  );
}
