'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { SelectionActionsBarProps } from '@genfeedai/props/content/ingredient.props';
import { Button } from '@ui/primitives/button';
import PromptBarDivider from '@ui/prompt-bars/components/divider/PromptBarDivider';
import { Download, Film, Trash2, X } from 'lucide-react';
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

  if (count <= 0) {
    return null;
  }

  const hasConstructiveActions = Boolean(
    (canPublishCampaign && onPublishCampaign) || canMerge || onDownload,
  );

  return (
    <div className="sticky top-4 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-border">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-foreground">
          {translate('count', { count })}
        </span>

        <Button
          ariaLabel="Clear selection"
          label={<X />}
          variant={ButtonVariant.SECONDARY}
          onClick={onClear}
          tooltip="Clear"
        />
      </div>

      <div className="flex items-center gap-2">
        {canPublishCampaign && onPublishCampaign && (
          <Button
            label="Publish Carousel"
            variant={ButtonVariant.DEFAULT}
            onClick={onPublishCampaign}
            isDisabled={count < 2}
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
            isDisabled={count < 2}
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
            tooltip={`Download ${count} selected`}
          />
        )}

        {hasConstructiveActions && <PromptBarDivider />}

        <Button
          ariaLabel="Delete selection"
          label={<Trash2 />}
          variant={ButtonVariant.DESTRUCTIVE}
          onClick={onBulkDelete}
          isDisabled={count === 0}
          tooltip={`Delete ${count} selected`}
        />
      </div>
    </div>
  );
}
