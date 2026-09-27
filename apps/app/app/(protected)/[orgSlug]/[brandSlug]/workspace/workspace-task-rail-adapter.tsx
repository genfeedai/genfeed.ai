import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import type { WorkspaceTaskRailAdapterProps } from '@props/workspace/workspace-task-inspector.props';
import { WorkspaceTaskDetail } from './workspace-task-inspector';

/**
 * Renders the task selected from `/workspace/inbox` into the shell's context
 * sidebar. The sidebar's close control calls `onClose`, which clears the
 * selection and the `?taskId=` search param.
 */
export function WorkspaceTaskRailAdapter({
  busyTaskId,
  onApprove,
  onClose,
  onDismiss,
  onKeepOutput,
  onPlanNextSteps,
  onRequestChanges,
  onTrashOutput,
  onUnkeepOutput,
  selectionOrigin,
  task,
}: WorkspaceTaskRailAdapterProps) {
  return (
    <ContextSidebarPanel
      onClose={onClose}
      selection={
        task
          ? {
              id: task.id,
              kind: 'task',
              origin: selectionOrigin,
              subtitle: task.identifier,
              title: task.title,
            }
          : null
      }
    >
      {task ? (
        <WorkspaceTaskDetail
          key={task.id}
          busyTaskId={busyTaskId}
          onApprove={onApprove}
          onDismiss={onDismiss}
          onKeepOutput={onKeepOutput}
          onPlanNextSteps={onPlanNextSteps}
          onRequestChanges={onRequestChanges}
          onTrashOutput={onTrashOutput}
          onUnkeepOutput={onUnkeepOutput}
          task={task}
        />
      ) : null}
    </ContextSidebarPanel>
  );
}
