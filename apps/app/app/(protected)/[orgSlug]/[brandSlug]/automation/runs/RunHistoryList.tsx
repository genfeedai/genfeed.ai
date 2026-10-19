'use client';

import { ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { getWorkflowExecutionLabel } from '@genfeedai/helpers/automation/workflow-execution.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { RunHistoryListProps } from '@props/automation/run-history-list.props';
import type { TableColumn } from '@props/ui/display/table.props';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import {
  formatExecutionDuration,
  formatExecutionRelativeTime,
  getExecutionCredits,
  getExecutionStatusLabel,
} from './workflow-execution.helpers';

export default function RunHistoryList({
  executions,
  isLoading,
  isPaginated = false,
  onClearFilter,
}: RunHistoryListProps) {
  const translate = useTranslations('common.automation.workflowExecutions');
  const translateExecutions = useTranslations(
    'common.automation.workflows.executions',
  );
  const { href } = useOrgUrl();

  const columns = useMemo<TableColumn<IWorkflowExecution>[]>(
    () => [
      {
        className: 'w-full max-w-0',
        header: translate('columnRun'),
        key: 'label',
        render: (execution) => (
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              {getWorkflowExecutionLabel(
                execution,
                translate('unavailableWorkflow'),
              )}
            </p>
            {execution.error ? (
              <p
                className="truncate text-xs text-destructive"
                title={execution.error}
              >
                {execution.failedNodeId ? `${execution.failedNodeId}: ` : ''}
                {execution.error}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        className: 'w-32',
        header: translate('columnStatus'),
        key: 'status',
        render: (execution) => (
          <Badge
            status={execution.status.toLowerCase()}
            size={ComponentSize.SM}
            className="w-28 justify-center"
          >
            {getExecutionStatusLabel(execution.status, translate)}
          </Badge>
        ),
      },
      {
        className: 'w-24 text-right',
        header: translate('columnCredits'),
        key: 'credits',
        render: (execution) => {
          const credits = getExecutionCredits(execution);
          if (credits.value <= 0) return '—';
          const formatted = credits.value.toLocaleString('en-US');
          return credits.isEstimate ? (
            <span title={translate('creditsEstimated')}>~{formatted}</span>
          ) : (
            formatted
          );
        },
      },
      {
        className: 'w-24 text-right',
        header: translate('columnDuration'),
        key: 'duration',
        render: (execution) => formatExecutionDuration(execution.durationMs),
      },
      {
        className: 'w-28 text-right',
        header: translate('columnStarted'),
        key: 'when',
        render: (execution) =>
          formatExecutionRelativeTime(
            execution.completedAt ?? execution.startedAt ?? execution.createdAt,
            translate,
          ),
      },
    ],
    [translate],
  );

  return (
    <div className="flex flex-col gap-4">
      <AppTable<IWorkflowExecution>
        ariaLabel={translate('recentRuns')}
        columns={columns}
        emptyLabel={
          onClearFilter ? translate('emptyFiltered') : translate('empty')
        }
        getItemId={(execution) => execution.id}
        getRowKey={(execution) => execution.id}
        getRowLink={(execution) => ({
          href: href(`${APP_ROUTES.AUTOMATION.RUNS}/${execution.id}`),
          label: translateExecutions('viewDetails'),
        })}
        isLoading={isLoading && executions.length === 0}
        items={executions}
        label={translate('recentRuns')}
      />
      {isPaginated && !isLoading && executions.length > 0 ? (
        <AutoPagination showTotal totalLabel={translate('paginationLabel')} />
      ) : null}
    </div>
  );
}
