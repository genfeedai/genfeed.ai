'use client';

import { PageScope } from '@genfeedai/enums';
import type {
  IBrand,
  IOrganization,
  ITraining,
  IUser,
} from '@genfeedai/interfaces';
import { Code } from '@genfeedai/ui';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import type { TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import { Switch } from '@ui/primitives/switch';

export type BuildTrainingsTableColumnsParams = {
  scope: PageScope;
  onToggleActive: (training: ITraining) => void;
};

export function buildTrainingsTableColumns({
  scope,
  onToggleActive,
}: BuildTrainingsTableColumnsParams): TableColumn<ITraining>[] {
  const baseColumns: TableColumn<ITraining>[] = [
    {
      header: 'Name',
      key: 'label',
      render: (training) => (
        <div>
          <div className="font-semibold text-foreground">{training.label}</div>
          {training.externalId && (
            <div className="text-xs text-muted-foreground">
              {training.externalId}
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Trigger Word',
      key: 'trigger_word',
      render: (training: ITraining) => (
        <Code size="md">{training.trigger}</Code>
      ),
    },
    {
      header: 'Status',
      key: 'status',
      render: (training: ITraining) => <Badge status={training.status} />,
    },
    {
      className: 'text-center',
      header: 'Steps',
      key: 'steps',
      render: (training: ITraining) => (
        <span className="text-center">
          {formatNumberWithCommas(training.steps || 0)}
        </span>
      ),
    },
    {
      className: 'text-center',
      header: 'Sources',
      key: 'totalSources',
      render: (training: ITraining) => (
        <span className="text-center">{training.totalSources || 0}</span>
      ),
    },
    {
      className: 'text-center',
      header: 'Generated',
      key: 'totalGeneratedImages',
      render: (training: ITraining) => (
        <span className="text-center">
          {training.totalGeneratedImages || 0}
        </span>
      ),
    },
    {
      header: 'Active',
      key: 'isActive',
      render: (training: ITraining) => (
        <Switch
          isChecked={training.isActive !== false}
          onChange={() => onToggleActive(training)}
        />
      ),
    },
  ];

  // Add owner column for admin app
  if (scope === PageScope.SUPERADMIN) {
    baseColumns.splice(1, 0, {
      header: 'Owner',
      key: 'owner',
      render: (training: ITraining) => (
        <div className="text-sm">
          {training.organization && (
            <div className="text-foreground/80">
              {(training?.organization as IOrganization).label}
            </div>
          )}
          {training.brand && (
            <div className="text-muted-foreground">
              {(training?.brand as IBrand).label}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {(training?.user as IUser).fullName}
          </div>
        </div>
      ),
    });
  }

  return baseColumns;
}
