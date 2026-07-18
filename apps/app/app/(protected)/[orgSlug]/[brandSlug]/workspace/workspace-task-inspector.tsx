'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import type { Task } from '@services/management/tasks.service';
import { Sheet, SheetContent } from '@ui/primitives/sheet';
import { useMemo } from 'react';
import { getAdvancedToolHref } from './workspace-task.helpers';
import { WorkspaceTaskInspectorBody } from './workspace-task-inspector-body';
import { WorkspaceTaskInspectorFooter } from './workspace-task-inspector-footer';
import { WorkspaceTaskInspectorHeader } from './workspace-task-inspector-header';
import { groupWorkspaceLinkedOutputs } from './workspace-task-inspector-helpers';
import {
  useWorkspaceTaskLinkedIssue,
  useWorkspaceTaskLinkedOutputs,
  useWorkspaceTaskLinkedRunSummary,
} from './workspace-task-inspector-hooks';

type WorkspaceTaskInspectorProps = {
  busyTaskId: string | null;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onKeepOutput: (taskId: string, outputId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onPlanNextSteps: (task: Task) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  onTrashOutput: (taskId: string, outputId: string) => Promise<void>;
  onUnkeepOutput: (taskId: string, outputId: string) => Promise<void>;
  task: Task | null;
};

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
  const isStudioEnabled = useFeatureFlag('studio');
  const isBusy = busyTaskId === task?.id;
  const showReviewActions = task?.reviewState === 'pending_approval';
  const linkedIssueSummary = useWorkspaceTaskLinkedIssue(task);
  const linkedRunSummary = useWorkspaceTaskLinkedRunSummary(task);
  const linkedOutputSummary = useWorkspaceTaskLinkedOutputs(task);
  const taskToolHref =
    task && linkedRunSummary.reportThreadId
      ? `${APP_ROUTES.AGENT.ROOT}/${linkedRunSummary.reportThreadId}`
      : task
        ? getAdvancedToolHref(task, isStudioEnabled)
        : '/orchestration/runs';
  const taskToolLabel = linkedRunSummary.reportThreadId
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
        className="w-full overflow-y-auto border-white/10 bg-background p-0 sm:max-w-2xl"
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
              linkedRunSummary={linkedRunSummary}
              onKeepOutput={onKeepOutput}
              onTrashOutput={onTrashOutput}
              onUnkeepOutput={onUnkeepOutput}
              task={task}
            />
            <WorkspaceTaskInspectorFooter
              isBusy={isBusy}
              isStudioEnabled={isStudioEnabled}
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
