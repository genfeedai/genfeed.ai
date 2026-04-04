'use client';

import { ButtonSize, ButtonVariant, IngredientStatus } from '@genfeedai/enums';
import type { StudioSelectionActionsBarProps } from '@props/studio/studio.props';
import Button from '@ui/buttons/base/Button';
import type { ReactNode } from 'react';
import {
  HiArchiveBox,
  HiCheck,
  HiNoSymbol,
  HiTrash,
  HiXMark,
} from 'react-icons/hi2';

interface StatusAction {
  icon: ReactNode;
  status: IngredientStatus;
  tooltip: string;
  variant: ButtonVariant;
}

const STATUS_ACTIONS: StatusAction[] = [
  {
    icon: <HiCheck />,
    status: IngredientStatus.VALIDATED,
    tooltip: 'Mark as Validated',
    variant: ButtonVariant.DEFAULT,
  },
  {
    icon: <HiArchiveBox />,
    status: IngredientStatus.ARCHIVED,
    tooltip: 'Archive Selected',
    variant: ButtonVariant.DESTRUCTIVE,
  },
  {
    icon: <HiNoSymbol />,
    status: IngredientStatus.REJECTED,
    tooltip: 'Reject Selected',
    variant: ButtonVariant.DESTRUCTIVE,
  },
];

export default function StudioSelectionActionsBar({
  count,
  onClear,
  onBulkDelete,
  onBulkStatusChange,
  isBulkUpdating = false,
}: StudioSelectionActionsBarProps): ReactNode {
  if (count <= 0) {
    return null;
  }

  return (
    <div className="flex justify-end items-center gap-2 mb-4 p-3 bg-background">
      <span className="text-sm font-medium">{count} selected</span>

      <Button
        label={<HiXMark />}
        variant={ButtonVariant.SECONDARY}
        size={ButtonSize.SM}
        onClick={onClear}
        tooltip="Clear Selection"
      />

      {STATUS_ACTIONS.map((action) => (
        <Button
          key={action.status}
          label={action.icon}
          variant={action.variant}
          size={ButtonSize.SM}
          onClick={() => onBulkStatusChange(action.status)}
          isLoading={isBulkUpdating}
          tooltip={action.tooltip}
        />
      ))}

      <Button
        variant={ButtonVariant.DESTRUCTIVE}
        size={ButtonSize.SM}
        onClick={onBulkDelete}
        isDisabled={count === 0}
        tooltip={`Delete ${count} selected`}
        label={<HiTrash />}
      />
    </div>
  );
}
