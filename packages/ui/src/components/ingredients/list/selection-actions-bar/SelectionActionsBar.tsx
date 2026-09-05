'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { SelectionActionsBarProps } from '@genfeedai/props/content/ingredient.props';
import SelectionToolbar from '@ui/lists/selection-toolbar/SelectionToolbar';
import { Button } from '@ui/primitives/button';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import { Download, Film, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

export default function SelectionActionsBar({
  count,
  canMerge = false,
  canPublishCampaign = false,
  isMerging = false,
  onClear,
  onBulkDelete,
  onDownload,
  onMerge,
  onPublishCampaign,
}: SelectionActionsBarProps) {
  const translate = useTranslations('common.selectionActions');

  const hasConstructiveActions = Boolean(
    (canPublishCampaign && onPublishCampaign) || canMerge || onDownload,
  );

  return (
    <SelectionToolbar
      count={count}
      label={translate('count', { count })}
      onClear={onClear}
    >
      {canPublishCampaign && onPublishCampaign && (
        <Button
          label="Publish Carousel"
          variant={ButtonVariant.DEFAULT}
          onClick={onPublishCampaign}
          isDisabled={isMerging || count < 2}
          tooltip={
            count < 2
              ? 'Select at least 2 campaign images to publish'
              : 'Publish selected campaign as Instagram carousel'
          }
        />
      )}

      {canMerge && (
        <Button
          label={
            <>
              <Film /> {translate('merge')}
            </>
          }
          variant={ButtonVariant.DEFAULT}
          onClick={onMerge}
          isLoading={isMerging}
          isDisabled={isMerging || count < 2}
          tooltip={
            count < 2 ? 'Select at least 2 to merge' : `Merge ${count} items`
          }
        />
      )}

      {onDownload && (
        <Button
          label={
            <>
              <Download /> {translate('download')}
            </>
          }
          variant={ButtonVariant.SECONDARY}
          onClick={onDownload}
          isDisabled={isMerging}
          tooltip={`Download ${count} selected`}
        />
      )}

      {hasConstructiveActions && <PromptBarDivider />}

      <Button
        ariaLabel="Delete selection"
        label={<Trash2 />}
        variant={ButtonVariant.DESTRUCTIVE}
        onClick={onBulkDelete}
        isDisabled={isMerging || count === 0}
        tooltip={`Delete ${count} selected`}
      />
    </SelectionToolbar>
  );
}
