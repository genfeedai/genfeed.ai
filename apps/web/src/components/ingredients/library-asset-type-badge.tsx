'use client';

import {
  ComponentSize,
  formatEnumLabel,
  type IngredientCategory,
} from '@genfeedai/contracts';
import { getLibraryAssetType } from '@genfeedai/utils/media/library-asset-type.util';
import Badge from '@ui/display/badge/Badge';

export default function LibraryAssetTypeBadge({
  category,
}: {
  category: IngredientCategory | string;
}) {
  const assetType = getLibraryAssetType(category);

  return (
    <Badge size={ComponentSize.SM} variant={assetType?.badgeVariant ?? 'slate'}>
      {assetType?.label ?? formatEnumLabel(category) ?? category}
    </Badge>
  );
}
