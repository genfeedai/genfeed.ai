'use client';

import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import { Checkbox } from '@ui/primitives/checkbox';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import WorkflowCardPreview from './WorkflowCardPreview';
import WorkflowFactLine from './WorkflowFactLine';
import WorkflowOpenAction from './WorkflowOpenAction';
import WorkflowScheduleSwitch from './WorkflowScheduleSwitch';
import WorkflowStatusBadges from './WorkflowStatusBadges';
import type { WorkflowLibraryItemProps } from './workflow-library.types';

/**
 * One workflow in the All grid. Same actions as the list row, plus the graph
 * or thumbnail preview. The edge lifts to `shadow-border-strong` on hover and
 * nothing else changes.
 */
export default function WorkflowLibraryCard({
  workflow,
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
    <Card
      bodyClassName="h-full justify-between"
      className="group h-full hover:shadow-border-strong"
      data-testid="workflow-library-card"
      description={workflow.description || undefined}
      headerAction={
        <div className="relative z-20 flex shrink-0 items-center gap-2">
          <Checkbox
            aria-label={translate('selectWorkflow', { name: workflow.label })}
            checked={isSelected}
            onCheckedChange={onToggleSelected}
          />
          <CollectionItemActions
            overflow={overflowActions}
            primary={
              <WorkflowOpenAction href={openHref} name={workflow.label} />
            }
          />
        </div>
      }
      label={workflow.label}
    >
      <Link
        aria-hidden="true"
        className="absolute inset-0 z-10 rounded-card"
        data-testid="workflow-card-hit-area"
        href={openHref}
        tabIndex={-1}
      />
      <div className="flex flex-col gap-3">
        <WorkflowCardPreview
          edges={workflow.edges}
          name={workflow.label}
          nodes={workflow.nodes}
          thumbnail={workflow.thumbnail}
        />
        <div className="flex items-center gap-2 text-xs text-foreground/60">
          <WorkflowStatusBadges
            isCloudStateVisible={isCloudStateVisible}
            isSystemWorkflow={isSystemWorkflow}
            workflow={workflow}
          />
          <WorkflowFactLine className="flex-1" workflow={workflow} />
          <div className="relative z-20 flex shrink-0 items-center">
            <WorkflowScheduleSwitch
              onToggleSchedule={onToggleSchedule}
              workflow={workflow}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
