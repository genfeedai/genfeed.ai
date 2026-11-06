'use client';

import { getIngredientPromptText } from '@genfeedai/utils/media/ingredient-ledger.util';
import { getIngredientDisplayLabel } from '@genfeedai/utils/media/ingredient-type.util';
import { getLibraryAssetTypeLabel } from '@genfeedai/utils/media/library-asset-type.util';
import { Badge } from '@ui/primitives/badge';
import { FileText } from 'lucide-react';
import type { IngredientTileProps } from '@/props/content/ingredient.props';
import IngredientTileFrame from './IngredientTileFrame';
import { TYPE_BADGE_CLASS } from './ingredient-tile-kind.util';

/**
 * A Library text asset as a snippet card: its name, then the first lines of
 * the copy. The full text opens in the inspector.
 */
export default function IngredientTextTile(props: IngredientTileProps) {
  const { ingredient } = props;
  const label = getIngredientDisplayLabel(ingredient);
  const snippet =
    ingredient.text?.trim() ||
    ingredient.metadataDescription?.trim() ||
    getIngredientPromptText(ingredient)?.trim() ||
    '';

  return (
    <IngredientTileFrame {...props}>
      <div className="flex flex-col gap-2 p-3 pt-10 pb-10">
        <div className={`absolute top-2 left-2 ${TYPE_BADGE_CLASS}`}>
          <Badge
            icon={<FileText aria-hidden="true" className="size-3.5" />}
            variant="secondary"
          >
            {getLibraryAssetTypeLabel(ingredient.category) ?? 'Text'}
          </Badge>
        </div>
        {label ? (
          <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {label}
          </p>
        ) : null}
        {snippet ? (
          <p className="line-clamp-6 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {snippet}
          </p>
        ) : null}
      </div>
    </IngredientTileFrame>
  );
}
