'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IAgentRun } from '@genfeedai/interfaces';
import type { Task, TasksService } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import {
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlineInboxStack,
} from 'react-icons/hi2';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { ReviewInboxSummary } from './workspace-task.helpers';
import {
  ADVANCED_TOOLS,
  LIBRARY_SNAPSHOT_LINKS,
  WORKSPACE_SECTION_STACK_CLASS,
} from './workspace-task.helpers';
import { WorkspaceTaskCard } from './workspace-task-card';
import { WorkspaceTaskRow } from './workspace-task-row';

interface WorkspaceOverviewSidebarProps {
  busyTaskId: string | null;
  historyPreviewItems: Task[];
  initialActiveRuns: IAgentRun[];
  initialReviewInbox: ReviewInboxSummary;
  inProgressTasks: Task[];
  mutateTask: (
    taskId: string,
    operation: (service: TasksService) => Promise<Task>,
  ) => Promise<void>;
  openPlanningConversation: (task: Task) => Promise<void>;
  replaceTaskSearchParam: (taskId: string | null) => void;
  setSelectedTaskId: (taskId: string | null) => void;
}

export function WorkspaceOverviewSidebar({
  busyTaskId,
  historyPreviewItems,
  initialActiveRuns,
  initialReviewInbox,
  inProgressTasks,
  mutateTask,
  openPlanningConversation,
  replaceTaskSearchParam,
  setSelectedTaskId,
}: WorkspaceOverviewSidebarProps) {
  const taskStreamContent =
    inProgressTasks.length > 0 ? (
      <div className="divide-y divide-white/[0.06]">
        {inProgressTasks.map((task) => (
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
            onPlanNextSteps={(task) => openPlanningConversation(task)}
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
        No active workspace tasks right now.
      </p>
    );

  const historyContent =
    historyPreviewItems.length > 0 ? (
      <div className="divide-y divide-white/[0.06]">
        {historyPreviewItems.map((task) => (
          <WorkspaceTaskRow
            key={task.id}
            task={task}
            onOpen={(openedTask) => {
              setSelectedTaskId(openedTask.id);
              replaceTaskSearchParam(openedTask.id);
            }}
          />
        ))}
      </div>
    ) : (
      <AppTable<Task>
        items={[]}
        columns={[]}
        emptyLabel="Activity will appear here once the workspace starts routing work."
      />
    );

  return (
    <div className={WORKSPACE_SECTION_STACK_CLASS}>
      <section data-testid="workspace-in-progress">
        <Card
          label="In progress"
          description="Active workspace tasks and live execution state."
          bodyClassName="space-y-3 p-4"
        >
          {taskStreamContent}

          <div className="border-t border-white/[0.06] pt-4">
            <div className="flex items-center justify-between text-sm text-foreground/55">
              <span>Live runs</span>
              <span>{initialActiveRuns.length}</span>
            </div>
          </div>
        </Card>
      </section>

      <section data-testid="workspace-recent-outputs">
        <Card
          label="Recent outputs"
          description="Latest generated ingredients and posts."
          bodyClassName="p-4"
        >
          {initialReviewInbox.recentItems.length > 0 ? (
            <div className="divide-y divide-white/[0.06]">
              {initialReviewInbox.recentItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {item.summary}
                    </p>
                    <p className="text-sm text-foreground/55">
                      {item.format}
                      {item.platform ? ` on ${item.platform}` : ''}
                    </p>
                    <p className="text-xs text-foreground/40">
                      <ClientFormattedDate value={item.createdAt} />
                    </p>
                  </div>
                  {item.reviewDecision === 'approved' ? (
                    <HiOutlineCheckCircle className="size-5 text-emerald-300" />
                  ) : item.reviewDecision === 'request_changes' ? (
                    <HiOutlineClipboardDocumentCheck className="size-5 text-amber-300" />
                  ) : (
                    <HiOutlineInboxStack className="size-5 text-foreground/40" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground/45">
              Recent outputs will appear here once the workspace starts routing
              work.
            </p>
          )}
        </Card>
      </section>

      <section data-testid="workspace-history-preview">
        <Card
          label="Recent activity"
          description="Execution logs stay available without owning the main navigation."
          headerAction={
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
            >
              <Link href="/workspace/inbox/unread">Open Inbox</Link>
            </Button>
          }
          bodyClassName="p-4"
        >
          {historyContent}
        </Card>
      </section>

      <section data-testid="workspace-library-snapshot">
        <Card
          label="Library snapshot"
          description="Keep the ingredient library one click away from the dashboard."
          bodyClassName="p-4"
        >
          <div className="divide-y divide-white/[0.06]">
            {LIBRARY_SNAPSHOT_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block py-4 first:pt-0 last:pb-0"
              >
                <p className="text-sm font-semibold text-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-sm text-foreground/55">
                  {item.description}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <section data-testid="workspace-advanced-tools">
        <Card
          label="Operator tools"
          description="Manual and expert surfaces stay available without owning the main navigation."
          bodyClassName="p-4"
        >
          <div className="divide-y divide-white/[0.06]">
            {ADVANCED_TOOLS.map((tool) => (
              <Link
                key={tool.href}
                href={tool.href}
                aria-label={tool.label}
                className="block py-4 first:pt-0 last:pb-0"
              >
                <p className="text-sm font-semibold text-foreground">
                  {tool.label}
                </p>
                <p className="mt-1 text-sm text-foreground/55">
                  {tool.description}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      </section>
    </div>
  );
}
