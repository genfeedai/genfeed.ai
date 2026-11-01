'use client';

import { formatEnumLabel, type IngredientCategory } from '@genfeedai/contracts';
import { getLibraryAssetType } from '@genfeedai/utils/media/library-asset-type.util';
import { Badge } from '@ui/primitives/badge';

export default function LibraryAssetTypeBadge({
  category,
}: {
  category: IngredientCategory | string;
}) {
  const assetType = getLibraryAssetType(category);

  return (
    <Badge variant={assetType?.badgeVariant ?? 'secondary'}>
      {assetType?.label ?? formatEnumLabel(category) ?? category}
    </Badge>
  );
}
