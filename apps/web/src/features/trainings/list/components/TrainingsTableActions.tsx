'use client';

import type { ITraining } from '@genfeedai/contracts/interfaces';
import type { TableAction } from '@props/ui/display/table.props';
import { Trash2 } from 'lucide-react';

export type BuildTrainingsTableActionsParams = {
  onDelete: (training: ITraining) => void;
};

export function buildTrainingsTableActions({
  onDelete,
}: BuildTrainingsTableActionsParams): TableAction<ITraining>[] {
  return [
    {
      className: 'text-destructive hover:text-destructive',
      icon: () => <Trash2 />,
      onClick: (training: ITraining) => {
        onDelete(training);
      },
      tooltip: 'Delete',
    },
  ];
}
