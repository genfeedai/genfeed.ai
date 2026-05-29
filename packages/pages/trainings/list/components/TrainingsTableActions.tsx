'use client';

import type { ITraining } from '@genfeedai/interfaces';
import type { TableAction } from '@props/ui/display/table.props';
import { HiEye, HiPencil, HiTrash } from 'react-icons/hi2';

export type BuildTrainingsTableActionsParams = {
  onEdit: (training: ITraining) => void;
  onView: (training: ITraining) => void;
  onDelete: (training: ITraining) => void;
};

export function buildTrainingsTableActions({
  onEdit,
  onView,
  onDelete,
}: BuildTrainingsTableActionsParams): TableAction<ITraining>[] {
  return [
    {
      icon: () => <HiPencil />,
      onClick: (training: ITraining) => {
        onEdit(training);
      },
      tooltip: 'Edit',
    },
    {
      icon: () => <HiEye />,
      onClick: (training: ITraining) => onView(training),
      tooltip: 'Details',
    },
    {
      className: 'text-error hover:text-error',
      icon: () => <HiTrash />,
      onClick: (training: ITraining) => {
        onDelete(training);
      },
      tooltip: 'Delete',
    },
  ];
}
