import {
  ButtonSize,
  ButtonVariant,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { WorkflowExecutionCardProps } from '@props/automation/workflow-execution-card.props';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import {
  EXECUTION_STATUS_LABELS,
  formatExecutionDuration,
  formatExecutionRelativeTime,
  getExecutionLabel,
} from './workflow-execution.helpers';

export default function WorkflowExecutionCard({
  execution,
  onCancel,
}: WorkflowExecutionCardProps) {
  const translate = useTranslations('common.automation.workflowExecutions');
  const translateExecutions = useTranslations(
    'common.automation.workflows.executions',
  );
  const { href } = useOrgUrl();
  const isActive =
    execution.status === WorkflowExecutionStatus.PENDING ||
    execution.status === WorkflowExecutionStatus.RUNNING;
  const actionIds = Array.from(
    new Set(
      (execution.nodeResults ?? [])
        .map((result) => result.actionId)
        .filter((actionId): actionId is string => Boolean(actionId)),
    ),
  );

  return (
    <div className="gen-card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Badge status={execution.status.toLowerCase()}>
            {EXECUTION_STATUS_LABELS[execution.status]}
          </Badge>
          <span className="truncate text-sm font-medium">
            {getExecutionLabel(execution, translate('unavailableWorkflow'))}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          {execution.creditsUsed > 0 ? (
            <span>
              {execution.creditsUsed} {translate('creditsSuffix')}
            </span>
          ) : null}
          {execution.durationMs ? (
            <span>{formatExecutionDuration(execution.durationMs)}</span>
          ) : null}
          <span>
            {formatExecutionRelativeTime(
              execution.completedAt ??
                execution.startedAt ??
                execution.createdAt,
            )}
          </span>
          <Button asChild size={ButtonSize.XS} variant={ButtonVariant.GHOST}>
            <Link href={href(`${APP_ROUTES.AUTOMATION.RUNS}/${execution.id}`)}>
              {translateExecutions('viewDetails')}
            </Link>
          </Button>
          {isActive && onCancel ? (
            <Button
              className="text-destructive hover:text-destructive"
              onClick={() => onCancel(execution.id)}
              size={ButtonSize.XS}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            >
              {translate('cancel')}
            </Button>
          ) : null}
        </div>
      </div>

      {isActive ? (
        <div className="h-1 w-full overflow-hidden bg-muted">
          <div
            className="h-full bg-info transition-[width] duration-500"
            style={{ width: `${execution.progress}%` }}
          />
        </div>
      ) : null}

      {actionIds.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {actionIds.map((actionId) => (
            <span
              className="bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground"
              key={actionId}
            >
              {actionId}
            </span>
          ))}
        </div>
      ) : null}

      {execution.error ? (
        <div className="truncate text-xs text-destructive">
          {execution.failedNodeId ? `${execution.failedNodeId}: ` : ''}
          {execution.error}
        </div>
      ) : null}
    </div>
  );
}
