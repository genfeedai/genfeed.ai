'use client';

import type { Task, TasksService } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import { WorkspaceTaskCard } from './workspace-task-card';

interface WorkspaceTaskQueueCardProps {
  busyTaskId: string | null;
  items: Task[];
  mutateTask: (
    taskId: string,
    operation: (service: TasksService) => Promise<Task>,
  ) => Promise<void>;
  openPlanningConversation: (task: Task) => Promise<void>;
}

export function WorkspaceTaskQueueCard({
  busyTaskId,
  items,
  mutateTask,
  openPlanningConversation,
}: WorkspaceTaskQueueCardProps) {
  return (
    <section id="task-queue" data-testid="workspace-task-list">
      <Card
        label="Task queue"
        description="Recent task requests across triage, active work, review, and completed output."
        bodyClassName="space-y-3 p-4"
      >
        {items.length > 0 ? (
          <div className="divide-y divide-white/[0.06]">
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
          <p className="text-sm text-foreground/45">
            No tasks yet. Start the first one from New Task.
          </p>
        )}
      </Card>
    </section>
  );
}
