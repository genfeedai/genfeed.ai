import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { WorkspaceTaskDetailProps } from '@props/workspace/workspace-task-inspector.props';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { getAdvancedToolHref } from './workspace-task.helpers';
import { WorkspaceTaskInspectorBody } from './workspace-task-inspector-body';
import { WorkspaceTaskInspectorHeader } from './workspace-task-inspector-header';
import { groupWorkspaceLinkedOutputs } from './workspace-task-inspector-helpers';
import {
  useWorkspaceTaskLinkedExecutionSummary,
  useWorkspaceTaskLinkedIssue,
  useWorkspaceTaskLinkedOutputs,
} from './workspace-task-inspector-hooks';

/**
 * Renders a task's header (with primary actions) and tabbed body in the
 * workspace inspector rail. Both `/workspace/inbox` and `/workspace/tasks`
 * mount this same detail view inside their own surface adapters instead of
 * each owning a bespoke panel.
 */
export function WorkspaceTaskDetail({
  busyTaskId,
  leading,
  onApprove,
  onDismiss,
  onKeepOutput,
  onPlanNextSteps,
  onRequestChanges,
  onTrashOutput,
  onUnkeepOutput,
  task,
  trailing,
}: WorkspaceTaskDetailProps) {
  const translate = useTranslations('pages.workspaceOverview.actions');
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
    ? translate('openReport')
    : translate('openTool');
  const linkedOutputGroups = useMemo(
    () => groupWorkspaceLinkedOutputs(linkedOutputSummary.outputs),
    [linkedOutputSummary.outputs],
  );

  if (!task) {
    return null;
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      data-testid="workspace-task-inspector"
    >
      {leading}
      <WorkspaceTaskInspectorHeader
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
      {trailing}
    </div>
  );
}
