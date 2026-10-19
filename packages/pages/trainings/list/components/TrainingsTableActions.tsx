'use client';

import type { ITraining } from '@genfeedai/contracts/interfaces';
import type { TableAction } from '@props/ui/display/table.props';
import { Pencil, Trash2 } from 'lucide-react';

export type BuildTrainingsTableActionsParams = {
  onEdit: (training: ITraining) => void;
  onDelete: (training: ITraining) => void;
};

export function buildTrainingsTableActions({
  onEdit,
  onDelete,
}: BuildTrainingsTableActionsParams): TableAction<ITraining>[] {
  return [
    {
      icon: () => <Pencil />,
      onClick: (training: ITraining) => {
        onEdit(training);
      },
      tooltip: 'Edit',
    },
    {
      className: 'text-error hover:text-error',
      icon: () => <Trash2 />,
      onClick: (training: ITraining) => {
        onDelete(training);
      },
      tooltip: 'Delete',
    },
  ];
}
