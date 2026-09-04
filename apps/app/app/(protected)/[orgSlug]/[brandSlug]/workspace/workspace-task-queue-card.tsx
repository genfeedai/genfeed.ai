'use client';

import type { Task, TasksService } from '@services/management/tasks.service';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { WorkspaceTaskCard } from './workspace-task-card';
import { WorkspaceTaskRowsSkeleton } from './workspace-task-loading';

interface WorkspaceTaskQueueCardProps {
  busyTaskId: string | null;
  isLoading?: boolean;
  items: Task[];
  mutateTask: (
    taskId: string,
    operation: (service: TasksService) => Promise<Task>,
  ) => Promise<void>;
  openPlanningConversation: (task: Task) => Promise<void>;
}

export function WorkspaceTaskQueueCard({
  busyTaskId,
  isLoading = false,
  items,
  mutateTask,
  openPlanningConversation,
}: WorkspaceTaskQueueCardProps) {
  return (
    <section
      aria-busy={isLoading}
      id="task-queue"
      data-testid="workspace-task-list"
    >
      <WorkspaceSurface
        density="compact"
        description="Recent task requests across triage, active work, review, and completed output."
        flush
        title="Task queue"
      >
        {isLoading && items.length === 0 ? (
          <WorkspaceTaskRowsSkeleton rows={4} />
        ) : items.length > 0 ? (
          <div className="divide-y divide-border">
            {items.map((task) => (
              <WorkspaceTaskCard
                key={task.id}
                task={task}
                busyTaskId={busyTaskId}
                onApprove={(taskId) =>
                  mutateTask(taskId, (service) => service.approve(taskId))
                }
                onDismiss={(taskId) =>
                  mutateTask(taskId, (service) => service.dismiss(taskId))
                }
                onPlanNextSteps={(t) => openPlanningConversation(t)}
                onRequestChanges={(taskId) =>
                  mutateTask(taskId, (service) =>
                    service.requestChanges(
                      taskId,
                      'Please revise this task from the workspace inbox.',
                    ),
                  )
                }
              />
            ))}
          </div>
        ) : (
          <p className="px-4 py-3 text-sm text-foreground/45 sm:px-5">
            No tasks yet. Start the first one from New Task.
          </p>
        )}
      </WorkspaceSurface>
    </section>
  );
}
