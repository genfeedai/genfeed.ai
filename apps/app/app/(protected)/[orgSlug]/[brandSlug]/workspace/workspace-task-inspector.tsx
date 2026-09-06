'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { WorkspaceTaskInspectorProps } from '@props/workspace/workspace-task-inspector.props';
import { Sheet, SheetContent } from '@ui/primitives/sheet';
import { useMemo } from 'react';
import { getAdvancedToolHref } from './workspace-task.helpers';
import { WorkspaceTaskInspectorBody } from './workspace-task-inspector-body';
import { WorkspaceTaskInspectorFooter } from './workspace-task-inspector-footer';
import { WorkspaceTaskInspectorHeader } from './workspace-task-inspector-header';
import { groupWorkspaceLinkedOutputs } from './workspace-task-inspector-helpers';
import {
  useWorkspaceTaskLinkedExecutionSummary,
  useWorkspaceTaskLinkedIssue,
  useWorkspaceTaskLinkedOutputs,
} from './workspace-task-inspector-hooks';

export function WorkspaceTaskInspector({
  busyTaskId,
  onApprove,
  onDismiss,
  onKeepOutput,
  onOpenChange,
  onPlanNextSteps,
  onRequestChanges,
  onTrashOutput,
  onUnkeepOutput,
  task,
}: WorkspaceTaskInspectorProps) {
  const isBusy = busyTaskId === task?.id;
  const showReviewActions = task?.reviewState === 'pending_approval';
  const linkedIssueSummary = useWorkspaceTaskLinkedIssue(task);
  const linkedExecutionSummary = useWorkspaceTaskLinkedExecutionSummary(task);
  const linkedOutputSummary = useWorkspaceTaskLinkedOutputs(task);
  const taskToolHref =
    task && linkedExecutionSummary.reportThreadId
      ? `${APP_ROUTES.AGENT.ROOT}/${linkedExecutionSummary.reportThreadId}`
      : task
        ? getAdvancedToolHref(task)
        : '/automation/runs';
  const taskToolLabel = linkedExecutionSummary.reportThreadId
    ? 'Open Report'
    : 'Open Tool';
  const linkedOutputGroups = useMemo(
    () => groupWorkspaceLinkedOutputs(linkedOutputSummary.outputs),
    [linkedOutputSummary.outputs],
  );

  return (
    <Sheet open={Boolean(task)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-0 border-l border-border bg-background p-0 shadow-none! sm:max-w-2xl"
      >
        {task ? (
          <div
            className="flex min-h-full flex-col"
            data-testid="workspace-task-inspector"
          >
            <WorkspaceTaskInspectorHeader task={task} />
            <WorkspaceTaskInspectorBody
              isBusy={isBusy}
              linkedIssueSummary={linkedIssueSummary}
              linkedOutputGroups={linkedOutputGroups}
              linkedOutputSummary={linkedOutputSummary}
              linkedExecutionSummary={linkedExecutionSummary}
              onKeepOutput={onKeepOutput}
              onTrashOutput={onTrashOutput}
              onUnkeepOutput={onUnkeepOutput}
              task={task}
            />
            <WorkspaceTaskInspectorFooter
              isBusy={isBusy}
              linkedIssueSummary={linkedIssueSummary}
              onApprove={onApprove}
              onDismiss={onDismiss}
              onPlanNextSteps={onPlanNextSteps}
              onRequestChanges={onRequestChanges}
              showReviewActions={showReviewActions ?? false}
              task={task}
              taskToolHref={taskToolHref}
              taskToolLabel={taskToolLabel}
            />
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
