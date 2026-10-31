'use client';

import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Checkbox } from '@ui/primitives/checkbox';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import WorkflowFactLine from './WorkflowFactLine';
import WorkflowOpenAction from './WorkflowOpenAction';
import WorkflowScheduleSwitch from './WorkflowScheduleSwitch';
import WorkflowStatusBadges from './WorkflowStatusBadges';
import type { WorkflowLibraryItemProps } from './workflow-library.types';

/**
 * One workflow in the All list: select, name + status, one fact line, the
 * inline schedule switch, Open, and an overflow for everything else. No graph
 * preview — that stays in grid view. The whole row opens the workflow on
 * pointer click; keyboard users reach the same place through Open.
 */
export default function WorkflowLibraryRow({
  workflow,
  executionCount,
  isReadOnly = false,
  openHref,
  isSelected,
  isSystemWorkflow,
  isCloudStateVisible,
  overflowActions,
  onToggleSelected,
  onToggleSchedule,
}: WorkflowLibraryItemProps) {
  const translate = useTranslations('common.automation.workflows.library');

  return (
    <ListRow
      className="relative hover:bg-hover"
      data-testid="workflow-library-row"
      density="compact"
      leading={
        <>
          <Link
            aria-hidden="true"
            className="absolute inset-0"
            data-testid="workflow-row-hit-area"
            href={openHref}
            tabIndex={-1}
          />
          {!isReadOnly ? (
            <div className="relative z-10 flex h-5 items-center">
              <Checkbox
                aria-label={translate('selectWorkflow', {
                  name: workflow.label,
                })}
                checked={isSelected}
                onCheckedChange={onToggleSelected}
              />
            </div>
          ) : null}
        </>
      }
      meta={
        <>
          {executionCount !== undefined ? (
            <span>{translate('runsCount', { count: executionCount })}</span>
          ) : null}
          <WorkflowFactLine workflow={workflow} />
        </>
      }
      title={
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate">{workflow.label}</span>
          <WorkflowStatusBadges
            isCloudStateVisible={isCloudStateVisible}
            isSystemWorkflow={isSystemWorkflow}
            workflow={workflow}
          />
        </span>
      }
      trailing={
        <div className="relative z-10 flex items-center gap-2">
          {!isReadOnly ? (
            <WorkflowScheduleSwitch
              onToggleSchedule={onToggleSchedule}
              workflow={workflow}
            />
          ) : null}
          <CollectionItemActions
            overflow={overflowActions}
            primary={
              <WorkflowOpenAction href={openHref} name={workflow.label} />
            }
          />
        </div>
      }
    />
  );
}
