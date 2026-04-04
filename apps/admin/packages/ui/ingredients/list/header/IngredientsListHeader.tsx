'use client';

import type { IngredientsListHeaderProps } from '@props/pages/ingredients-list.props';
import SelectionActionsBar from '@ui/ingredients/list/selection-actions-bar/SelectionActionsBar';

export default function IngredientsListHeader({
  selectedCount,
  canMerge,
  canPublishCampaign,
  isMerging,
  onClearSelection,
  onBulkDelete,
  onMerge,
  onPublishCampaign,
}: IngredientsListHeaderProps) {
  return (
    <SelectionActionsBar
      count={selectedCount}
      canMerge={canMerge}
      canPublishCampaign={canPublishCampaign}
      isMerging={isMerging}
      onClear={onClearSelection}
      onBulkDelete={onBulkDelete}
      onMerge={onMerge}
      onPublishCampaign={onPublishCampaign}
    />
  );
}
