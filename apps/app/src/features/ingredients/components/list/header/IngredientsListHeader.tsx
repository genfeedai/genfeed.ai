'use client';

import SelectionActionsBar from '@/features/ingredients/components/ingredients/list/selection-actions-bar/SelectionActionsBar';
import type { IngredientsListHeaderProps } from '@/features/ingredients/props/ingredients-list.props';

export default function IngredientsListHeader({
  selectedCount,
  canMerge,
  canPublishCampaign,
  isMerging,
  onClearSelection,
  onBulkDelete,
  onDownload,
  onMerge,
  onPublishCampaign,
  placement = 'overlay',
  tagAction,
}: IngredientsListHeaderProps) {
  return (
    <SelectionActionsBar
      count={selectedCount}
      canMerge={canMerge}
      canPublishCampaign={canPublishCampaign}
      isMerging={isMerging}
      onClear={onClearSelection}
      onBulkDelete={onBulkDelete}
      onDownload={onDownload}
      onMerge={onMerge}
      onPublishCampaign={onPublishCampaign}
      placement={placement}
      tagAction={tagAction}
    />
  );
}
