'use client';

import { ButtonVariant } from '@genfeedai/enums';
import type { SelectionActionsBarProps } from '@props/content/ingredient.props';
import Button from '@ui/buttons/base/Button';
import { HiFilm, HiTrash, HiXMark } from 'react-icons/hi2';

export default function SelectionActionsBar({
  count,
  canMerge = false,
  canPublishCampaign = false,
  isMerging = false,
  onClear,
  onBulkDelete,
  onMerge,
  onPublishCampaign,
}: SelectionActionsBarProps) {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="flex justify-end items-center gap-2 mb-4 p-3 bg-background">
      <span className="text-sm font-medium">{count} selected</span>

      <Button
        label={<HiXMark />}
        variant={ButtonVariant.SECONDARY}
        onClick={onClear}
        tooltip="Clear"
      />

      <Button
        variant={ButtonVariant.DESTRUCTIVE}
        onClick={onBulkDelete}
        isDisabled={count === 0}
        tooltip={`Delete ${count} selected`}
        label={<HiTrash />}
      />

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
              <HiFilm /> Merge
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
    </div>
  );
}
