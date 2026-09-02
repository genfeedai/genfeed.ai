'use client';

import {
  ButtonSize,
  ButtonVariant,
  normalizeReviewDecision,
  ReviewDecision,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import { useFeatureFlag } from '@hooks/feature-flags/use-feature-flag';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { Task, TasksService } from '@services/management/tasks.service';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import { Button } from '@ui/primitives/button';
import {
  AlertTriangle,
  CircleCheck,
  ClipboardCheck,
  Inbox,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { ReviewInboxSummary } from './workspace-task.helpers';
import {
  ADVANCED_TOOLS,
  LIBRARY_SNAPSHOT_LINKS,
  WORKSPACE_SECTION_STACK_CLASS,
} from './workspace-task.helpers';
import { WorkspaceTaskCard } from './workspace-task-card';
import { WorkspaceTaskRowsSkeleton } from './workspace-task-loading';
import { WorkspaceTaskRow } from './workspace-task-row';

interface WorkspaceOverviewSidebarProps {
  busyTaskId: string | null;
  historyPreviewItems: Task[];
  activeExecutions: IWorkflowExecution[];
  initialReviewInbox: ReviewInboxSummary;
  inProgressTasks: Task[];
  isTasksLoading?: boolean;
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
  activeExecutions,
  initialReviewInbox,
  inProgressTasks,
  isTasksLoading = false,
  mutateTask,
  openPlanningConversation,
  replaceTaskSearchParam,
  setSelectedTaskId,
}: WorkspaceOverviewSidebarProps) {
  const translate = useTranslations('pages.workspaceOverview');
  const isStudioEnabled = useFeatureFlag('studio');
  const { href, orgHref } = useOrgUrl();
  const availableAdvancedTools = ADVANCED_TOOLS.filter(
    (tool) => isStudioEnabled || !tool.href.startsWith(APP_ROUTES.STUDIO.ROOT),
  );
  const taskStreamContent =
    isTasksLoading && inProgressTasks.length === 0 ? (
      <WorkspaceTaskRowsSkeleton />
    ) : inProgressTasks.length > 0 ? (
      <div className="divide-y divide-border/60">
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
                  translate('requestChangesPrompt'),
                ),
              )
            }
          />
        ))}
      </div>
    ) : (
      <p className="text-sm text-foreground/45">{translate('noActiveTasks')}</p>
    );

  const historyContent =
    isTasksLoading && historyPreviewItems.length === 0 ? (
      <WorkspaceTaskRowsSkeleton rows={3} />
    ) : historyPreviewItems.length > 0 ? (
      <div className="divide-y divide-border/60">
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
      <section aria-busy={isTasksLoading} data-testid="workspace-in-progress">
        <Card
          label="In progress"
          description="Active workspace tasks and live execution state."
          bodyClassName="space-y-3 p-4"
        >
          {taskStreamContent}

          <div className="border-t border-border pt-4">
            <div className="flex items-center justify-between text-sm text-foreground/55">
              <span>{translate('liveRuns')}</span>
              <span>{activeExecutions.length}</span>
            </div>
          </div>
        </Card>
      </section>

      <section data-testid="workspace-recent-outputs">
        <Card
          label="Recent outputs"
          description="Latest generated ingredients and posts."
          headerAction={
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
            >
              <Link href={href(APP_ROUTES.PUBLISHING.REVIEW)}>
                {translate('openReview')}
              </Link>
            </Button>
          }
          bodyClassName="p-4"
        >
          {initialReviewInbox.recentItems.length > 0 ? (
            <div className="divide-y divide-border/60">
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
                    {item.continuityQa ? (
                      <div
                        className="mt-2 space-y-2 rounded-md border border-border/70 p-2"
                        data-testid={`continuity-${item.id}`}
                      >
                        <p className="flex items-center gap-1 text-xs font-semibold text-foreground/70">
                          {item.continuityQa.summary.driftClipCount > 0 ? (
                            <AlertTriangle className="size-3.5 text-amber-300" />
                          ) : null}
                          {translate('continuityStatus', {
                            status: item.continuityQa.status.replace('_', ' '),
                          })}
                        </p>
                        {item.continuityQa.skipReason ? (
                          <p className="text-xs text-foreground/50">
                            {item.continuityQa.skipReason.replaceAll('_', ' ')}
                          </p>
                        ) : null}
                        {item.continuityQa.clips.map((clip) => (
                          <div
                            key={clip.clipId}
                            className="text-xs text-foreground/55"
                          >
                            <p>
                              {translate('clipContinuitySummary', {
                                character: clip.character.verdict,
                                index: clip.clipIndex + 1,
                                outfit: clip.outfit.verdict,
                                product: clip.product.verdict,
                              })}
                            </p>
                            {clip.errors.map((error) => (
                              <p
                                key={`${clip.clipId}-${error.code}`}
                                className="text-amber-200/80"
                              >
                                {error.message}
                              </p>
                            ))}
                            {clip.evidenceFrames.map((frame, index) => (
                              <Link
                                key={frame.url}
                                href={frame.url}
                                target="_blank"
                                rel="noreferrer"
                                className="mr-2 underline underline-offset-2"
                              >
                                {translate('evidenceNumber', {
                                  number: index + 1,
                                })}
                              </Link>
                            ))}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {normalizeReviewDecision(item.reviewDecision) ===
                  ReviewDecision.APPROVED ? (
                    <CircleCheck className="size-5 text-emerald-300" />
                  ) : normalizeReviewDecision(item.reviewDecision) ===
                    ReviewDecision.REQUEST_CHANGES ? (
                    <ClipboardCheck className="size-5 text-amber-300" />
                  ) : (
                    <Inbox className="size-5 text-foreground/40" />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-foreground/45">
              {translate('recentOutputsEmpty')}
            </p>
          )}
        </Card>
      </section>

      <section
        aria-busy={isTasksLoading}
        data-testid="workspace-history-preview"
      >
        <Card
          label="Recent activity"
          description="Execution logs stay available without owning the main navigation."
          headerAction={
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
            >
              <Link href={APP_ROUTES.WORKSPACE.INBOX_UNREAD}>
                {translate('openInbox')}
              </Link>
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
          <div className="divide-y divide-border/60">
            {LIBRARY_SNAPSHOT_LINKS.map((item) => (
              <Link
                key={item.href}
                href={href(item.href)}
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
          <div className="divide-y divide-border/60">
            {availableAdvancedTools.map((tool) => (
              <Link
                key={tool.href}
                href={
                  tool.href.startsWith(APP_ROUTES.AGENT.ROOT)
                    ? orgHref(tool.href)
                    : href(tool.href)
                }
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
