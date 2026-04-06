'use client';

import { useAuth } from '@clerk/nextjs';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonSize,
  ButtonVariant,
  PromptCategory,
  SystemPromptKey,
} from '@genfeedai/enums';
import type { IAgentRun, IAnalytics } from '@genfeedai/interfaces';
import type { AgentRunStats } from '@genfeedai/types';
import { resolveClerkToken } from '@helpers/auth/clerk.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useWebsocketPrompt } from '@hooks/utils/use-websocket-prompt/use-websocket-prompt';
import type { Ingredient } from '@models/content/ingredient.model';
import { Prompt } from '@models/content/prompt.model';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { PromptsService } from '@services/content/prompts.service';
import { logger } from '@services/core/logger.service';
import { IssuesService } from '@services/management/issues.service';
import {
  type WorkspaceTask,
  WorkspaceTasksService,
} from '@services/workspace/workspace-tasks.service';
import type { Editor, JSONContent } from '@tiptap/core';
import Mention, { type MentionNodeAttrs } from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { EditorContent, ReactRenderer, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { SuggestionOptions } from '@tiptap/suggestion';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import Card from '@ui/card/Card';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Modal } from '@ui/modals/compound/Modal';
import AppLink from '@ui/navigation/link/Link';
import { Button } from '@ui/primitives/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  forwardRef,
  type ReactNode,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from 'react';
import {
  HiArrowTopRightOnSquare,
  HiOutlineCheckCircle,
  HiOutlineClipboardDocumentCheck,
  HiOutlineClock,
  HiOutlineInboxStack,
  HiOutlineSparkles,
  HiOutlineSquares2X2,
} from 'react-icons/hi2';
import tippy, { type Instance } from 'tippy.js';
import { WorkspaceDashboard } from './workspace-dashboard';

type WorkspaceSection = 'activity' | 'inbox' | 'overview';
type InboxView = 'all' | 'recent' | 'unread';
type WorkspaceTaskMode = 'standard' | 'research' | 'trends';

interface ReviewInboxItem {
  createdAt: string;
  format?: string;
  id: string;
  platform?: string;
  reviewDecision?: 'approved' | 'pending' | 'request_changes' | string;
  summary: string;
}

interface ReviewInboxSummary {
  approvedCount: number;
  changesRequestedCount: number;
  pendingCount: number;
  readyCount: number;
  recentItems: ReviewInboxItem[];
  rejectedCount: number;
}

interface WorkspaceBrandMentionItem {
  id: string;
  label: string;
}

interface WorkspaceBrandMentionListProps {
  command: (item: WorkspaceBrandMentionItem) => void;
  items: WorkspaceBrandMentionItem[];
}

interface WorkspaceBrandMentionMatch {
  id: string;
  label: string;
}

interface WorkspacePageContentProps {
  defaultInboxView?: InboxView;
  initialActiveRuns?: IAgentRun[];
  initialAnalytics?: Partial<IAnalytics>;
  initialReviewInbox?: ReviewInboxSummary;
  initialRuns?: IAgentRun[];
  initialStats?: AgentRunStats | null;
  initialTimeSeriesData?: PlatformTimeSeriesDataPoint[];
  section?: WorkspaceSection;
}

interface WorkspaceTaskLinkedRunSummary {
  generatedContentCount: number;
  reportThreadCount: number;
  reportThreadId: string | null;
}

interface WorkspaceTaskLinkedOutputSummary {
  error: string | null;
  isLoading: boolean;
  outputs: Ingredient[];
}

interface WorkspaceTaskLinkedIssueSummary {
  href: string | null;
  identifier: string | null;
  isLoading: boolean;
}

const DEFAULT_REVIEW_INBOX: ReviewInboxSummary = {
  approvedCount: 0,
  changesRequestedCount: 0,
  pendingCount: 0,
  readyCount: 0,
  recentItems: [],
  rejectedCount: 0,
};

const TASK_PRESETS = [
  {
    label: 'Image',
    outputType: 'image' as const,
  },
  {
    label: 'Video',
    outputType: 'video' as const,
  },
  {
    label: 'Caption',
    outputType: 'caption' as const,
  },
  {
    label: 'Auto',
    outputType: 'ingredient' as const,
  },
];

const INBOX_VIEW_OPTIONS: Array<{
  description: string;
  id: InboxView;
  label: string;
}> = [
  {
    description: 'Items that still need operator attention.',
    id: 'unread',
    label: 'Unread',
  },
  {
    description: 'Latest queue movement, regardless of status.',
    id: 'recent',
    label: 'Recent',
  },
  {
    description: 'Everything in the workspace queue, including done items.',
    id: 'all',
    label: 'All',
  },
];

const TASK_MODE_OPTIONS: Array<{
  description: string;
  id: WorkspaceTaskMode;
  label: string;
}> = [
  {
    description: 'Create the requested output directly.',
    id: 'standard',
    label: 'Standard',
  },
  {
    description:
      'Route the task as a research brief with findings and next steps.',
    id: 'research',
    label: 'Research',
  },
  {
    description:
      'Produce a trend-focused report with signals, angles, and recommendations.',
    id: 'trends',
    label: 'Trends',
  },
];

const SECTION_COPY: Record<
  WorkspaceSection,
  { description: string; title: string }
> = {
  activity: {
    description:
      'Chronological execution logs, routing detail, and task activity.',
    title: 'Workspace Activity',
  },
  inbox: {
    description: 'Unread work, recent movement, and the full queue.',
    title: 'Inbox',
  },
  overview: {
    description:
      'Tasks, approvals, live work, and operator handoffs in one control surface.',
    title: 'Workspace Dashboard',
  },
};

const ADVANCED_TOOLS = [
  {
    description: 'All conversations and threads live here.',
    href: '/chat',
    label: 'Chat',
  },
  {
    description: 'Manual image generation and creative edits.',
    href: '/studio/image',
    label: 'Studio Image',
  },
  {
    description: 'Manual video generation and editing.',
    href: '/studio/video',
    label: 'Studio Video',
  },
  {
    description: 'Workflow builder for repeatable automation.',
    href: '/orchestration/workflows',
    label: 'Workflows',
  },
  {
    description: 'Operator view for live runs and execution state.',
    href: '/orchestration/runs',
    label: 'Runs',
  },
];

const LIBRARY_SNAPSHOT_LINKS = [
  {
    description: 'Ingredients and reusable source material.',
    href: '/library/ingredients',
    label: 'Ingredients',
  },
  {
    description: 'Generated images, videos, and motion assets.',
    href: '/library/images',
    label: 'Media',
  },
  {
    description: 'Voice, music, and caption assets ready for reuse.',
    href: '/library/voices',
    label: 'Audio + captions',
  },
];

const WORKSPACE_CARD_GRID_GAP_CLASS =
  'grid gap-4 md:grid-cols-2 xl:grid-cols-4';
const WORKSPACE_SECTION_STACK_CLASS = 'space-y-6';

function getBrandDisplayLabel(brand?: {
  label?: string;
  name?: string | null;
}) {
  return brand?.label || brand?.name || 'Selected brand';
}

function extractBrandMentionMatch(
  node: JSONContent | null | undefined,
): WorkspaceBrandMentionMatch | null {
  if (!node) {
    return null;
  }

  if (node.type === 'mention' && node.attrs?.id) {
    return {
      id: String(node.attrs.id),
      label: String(node.attrs.label ?? node.attrs.id ?? '').trim() || 'Brand',
    };
  }

  for (const child of node.content ?? []) {
    const match = extractBrandMentionMatch(child);
    if (match) {
      return match;
    }
  }

  return null;
}

const WorkspaceBrandMentionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  WorkspaceBrandMentionListProps
>(function WorkspaceBrandMentionList({ command, items }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, []);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((prev) => (prev + items.length - 1) % items.length);
        return true;
      }

      if (event.key === 'ArrowDown') {
        setSelectedIndex((prev) => (prev + 1) % items.length);
        return true;
      }

      if (event.key === 'Enter') {
        const item = items[selectedIndex];
        if (item) {
          command(item);
        }
        return true;
      }

      return false;
    },
  }));

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-white/[0.12] bg-popover px-3 py-2 text-xs text-muted-foreground shadow-lg">
        No brands found
      </div>
    );
  }

  return (
    <div className="max-h-48 overflow-y-auto rounded-lg border border-white/[0.12] bg-popover shadow-lg">
      {items.map((item, index) => (
        <button
          type="button"
          key={item.id}
          onClick={() => command(item)}
          className={cn(
            'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
            index === selectedIndex
              ? 'bg-accent text-accent-foreground'
              : 'text-popover-foreground hover:bg-accent/50',
          )}
        >
          <span className="font-medium">@{item.label}</span>
        </button>
      ))}
    </div>
  );
});

function isTaskInInboxQueue(task: WorkspaceTask): boolean {
  return task.status !== 'dismissed' && task.reviewState !== 'dismissed';
}

function isUnreadInboxTask(task: WorkspaceTask): boolean {
  return (
    task.reviewState === 'pending_approval' ||
    task.reviewState === 'changes_requested' ||
    task.status === 'triaged' ||
    task.status === 'in_progress' ||
    task.status === 'needs_review' ||
    task.status === 'failed'
  );
}

function formatTaskTimestamp(task: WorkspaceTask): string {
  const source = task.updatedAt ?? task.createdAt;
  if (!source) {
    return 'just now';
  }

  const delta = Date.now() - new Date(source).getTime();
  const minutes = Math.floor(delta / 60_000);

  if (minutes < 1) {
    return 'just now';
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${Math.floor(hours / 24)}d ago`;
}

function formatTaskStatus(task: WorkspaceTask): string {
  switch (task.status) {
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'dismissed':
      return 'Dismissed';
    case 'needs_review':
      return task.reviewState === 'changes_requested'
        ? 'Changes Requested'
        : 'Needs Review';
    case 'in_progress':
      return 'In Progress';
    case 'triaged':
      return 'Triaged';
    default:
      return task.status;
  }
}

function getAdvancedToolHref(task: WorkspaceTask): string {
  switch (task.executionPathUsed) {
    case 'image_generation':
      return '/studio/image';
    case 'video_generation':
      return '/studio/video';
    case 'caption_generation':
      return '/chat';
    default:
      return '/orchestration/runs';
  }
}

function getTaskStateDotClass(task: WorkspaceTask): string {
  if (task.status === 'failed') {
    return 'bg-rose-400';
  }

  if (
    task.reviewState === 'pending_approval' ||
    task.reviewState === 'changes_requested' ||
    task.status === 'needs_review'
  ) {
    return 'bg-amber-300';
  }

  if (task.status === 'completed') {
    return 'bg-emerald-300';
  }

  return 'bg-sky-300';
}

function getEmptyLinkedRunSummary(): WorkspaceTaskLinkedRunSummary {
  return {
    generatedContentCount: 0,
    reportThreadCount: 0,
    reportThreadId: null,
  };
}

function getEmptyLinkedOutputSummary(): WorkspaceTaskLinkedOutputSummary {
  return {
    error: null,
    isLoading: false,
    outputs: [],
  };
}

function getEmptyLinkedIssueSummary(): WorkspaceTaskLinkedIssueSummary {
  return {
    href: null,
    identifier: null,
    isLoading: false,
  };
}

function isNonEmptyString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}

function useWorkspaceTaskLinkedRunSummary(
  task: WorkspaceTask | null,
): WorkspaceTaskLinkedRunSummary & { isLoading: boolean } {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedRunSummary>(
    getEmptyLinkedRunSummary(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const _linkedRunIdsKey = useMemo(
    () => task?.linkedRunIds.join('|') ?? '',
    [task?.linkedRunIds],
  );

  useEffect(() => {
    if (!task || task.linkedRunIds.length === 0) {
      setSummary(getEmptyLinkedRunSummary());
      setIsLoading(false);
      return;
    }

    const capturedTask = task;
    const linkedRunIds = capturedTask.linkedRunIds;

    let isCancelled = false;
    const controller = new AbortController();

    async function loadLinkedRunSummary() {
      try {
        setIsLoading(true);
        const token = await resolveClerkToken(getToken);
        if (isCancelled) {
          return;
        }

        if (!token) {
          setSummary(getEmptyLinkedRunSummary());
          setIsLoading(false);
          return;
        }

        const service = AgentRunsService.getInstance(token);
        const runResults = await Promise.allSettled(
          linkedRunIds.map(async (runId) => {
            const [run, content] = await Promise.all([
              service.getById(runId) as Promise<
                IAgentRun & { thread?: string }
              >,
              service.getRunContent(runId, controller.signal),
            ]);

            return {
              contentCount:
                (content.ingredients?.length ?? 0) +
                (content.posts?.length ?? 0),
              threadId: isNonEmptyString(run.thread) ? run.thread : null,
            };
          }),
        );

        if (isCancelled) {
          return;
        }

        const fulfilledResults = runResults.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value] : [],
        );
        const reportThreadIds = Array.from(
          new Set(
            fulfilledResults
              .map((result) => result.threadId)
              .filter(isNonEmptyString),
          ),
        );

        setSummary({
          generatedContentCount: fulfilledResults.reduce(
            (total, result) => total + result.contentCount,
            0,
          ),
          reportThreadCount: reportThreadIds.length,
          reportThreadId: reportThreadIds[0] ?? null,
        });
      } catch (error: unknown) {
        if ((error as Error).name === 'AbortError' || isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task run summary', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary(getEmptyLinkedRunSummary());
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadLinkedRunSummary();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [getToken, task]);

  return {
    ...summary,
    isLoading,
  };
}

function getWorkspaceLinkedOutputTitle(output: Ingredient): string {
  const metadataLabel = output.metadataLabel?.trim();
  if (metadataLabel) {
    return metadataLabel;
  }

  const metadataDescription = output.metadataDescription?.trim();
  if (metadataDescription) {
    return metadataDescription;
  }

  const promptText = output.promptText?.trim();
  if (promptText) {
    return promptText;
  }

  return output.id;
}

function getWorkspaceLinkedOutputDescription(
  output: Ingredient,
): string | null {
  const metadataDescription = output.metadataDescription?.trim();
  if (metadataDescription) {
    return metadataDescription;
  }

  const promptText = output.promptText?.trim();
  if (promptText) {
    return promptText;
  }

  return null;
}

function useWorkspaceTaskLinkedOutputs(
  task: WorkspaceTask | null,
): WorkspaceTaskLinkedOutputSummary {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedOutputSummary>(
    getEmptyLinkedOutputSummary(),
  );
  const _linkedOutputIdsKey = useMemo(
    () => task?.linkedOutputIds.join('|') ?? '',
    [task?.linkedOutputIds],
  );

  useEffect(() => {
    if (!task || task.linkedOutputIds.length === 0) {
      setSummary(getEmptyLinkedOutputSummary());
      return;
    }

    const capturedTask = task;
    let isCancelled = false;

    async function loadLinkedOutputs() {
      try {
        setSummary((current) => ({
          ...current,
          error: null,
          isLoading: true,
        }));

        const token = await resolveClerkToken(getToken);
        if (isCancelled) {
          return;
        }

        if (!token) {
          setSummary(getEmptyLinkedOutputSummary());
          return;
        }

        const service = IngredientsService.getInstance(token);
        const linkedOutputIds = Array.from(
          new Set(capturedTask.linkedOutputIds),
        );
        const results = await Promise.allSettled(
          linkedOutputIds.map(
            async (outputId) => await service.findOne(outputId),
          ),
        );

        if (isCancelled) {
          return;
        }

        const outputs = results.flatMap((result) =>
          result.status === 'fulfilled' ? [result.value as Ingredient] : [],
        );
        const rejectedCount = results.filter(
          (result) => result.status === 'rejected',
        ).length;

        setSummary({
          error:
            rejectedCount > 0
              ? 'Some linked outputs could not be loaded.'
              : null,
          isLoading: false,
          outputs,
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task linked outputs', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary({
          error: 'Linked outputs could not be loaded right now.',
          isLoading: false,
          outputs: [],
        });
      }
    }

    void loadLinkedOutputs();

    return () => {
      isCancelled = true;
    };
  }, [getToken, task]);

  return summary;
}

function useWorkspaceTaskLinkedIssue(
  task: WorkspaceTask | null,
): WorkspaceTaskLinkedIssueSummary {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedIssueSummary>(
    getEmptyLinkedIssueSummary(),
  );

  useEffect(() => {
    if (!task?.linkedIssueId) {
      setSummary(getEmptyLinkedIssueSummary());
      return;
    }

    const capturedTask = task;
    let isCancelled = false;

    async function loadLinkedIssue() {
      try {
        setSummary({
          href: null,
          identifier: null,
          isLoading: true,
        });

        const linkedId = capturedTask.linkedIssueId;
        if (!linkedId) {
          setSummary(getEmptyLinkedIssueSummary());
          return;
        }

        const token = await resolveClerkToken(getToken);
        if (!token || isCancelled) {
          setSummary(getEmptyLinkedIssueSummary());
          return;
        }

        const issue = await IssuesService.getInstance(token).findOne(linkedId);

        if (isCancelled) {
          return;
        }

        setSummary({
          href: `/issues/${issue.identifier}`,
          identifier: issue.identifier,
          isLoading: false,
        });
      } catch (error: unknown) {
        if (isCancelled) {
          return;
        }

        logger.warn('Failed to resolve workspace task linked issue', {
          error,
          reportToSentry: false,
          taskId: capturedTask.id,
        });
        setSummary(getEmptyLinkedIssueSummary());
      }
    }

    void loadLinkedIssue();

    return () => {
      isCancelled = true;
    };
  }, [getToken, task]);

  return summary;
}

function WorkspaceTaskRow({
  onOpen,
  task,
}: {
  onOpen: (task: WorkspaceTask) => void;
  task: WorkspaceTask;
}) {
  const needsAttention = isUnreadInboxTask(task);

  return (
    <button
      type="button"
      aria-label={`Open details for ${task.title}`}
      className="w-full border-b border-white/[0.06] px-4 py-4 text-left transition-colors duration-150 last:border-b-0 hover:bg-white/[0.03]"
      data-testid="workspace-task-row"
      onClick={() => onOpen(task)}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full',
            getTaskStateDotClass(task),
          )}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {task.title}
            </p>
            <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/65">
              {formatTaskStatus(task)}
            </span>
            {needsAttention ? (
              <span className="rounded-full bg-white/[0.06] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                Needs attention
              </span>
            ) : null}
          </div>

          <p className="mt-1 line-clamp-2 text-sm text-foreground/55">
            {task.request}
          </p>

          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-foreground/40">
            {task.routingSummary ? <span>{task.routingSummary}</span> : null}
            <span>{task.executionPathUsed.replaceAll('_', ' ')}</span>
            <span>{formatTaskTimestamp(task)}</span>
          </div>
        </div>

        <HiArrowTopRightOnSquare className="mt-1 h-4 w-4 shrink-0 text-foreground/30" />
      </div>
    </button>
  );
}

function WorkspaceTaskCard({
  busyTaskId,
  onApprove,
  onDismiss,
  onPlanNextSteps,
  onRequestChanges,
  task,
}: {
  busyTaskId: string | null;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onPlanNextSteps: (task: WorkspaceTask) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  task: WorkspaceTask;
}) {
  const isBusy = busyTaskId === task.id;
  const showReviewActions = task.reviewState === 'pending_approval';

  return (
    <article className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">{task.title}</p>
          <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/65">
            {formatTaskStatus(task)}
          </span>
        </div>
        <p className="text-sm text-foreground/55">{task.request}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-foreground/45">
          {task.routingSummary ? <span>{task.routingSummary}</span> : null}
          <span>{formatTaskTimestamp(task)}</span>
          <span className="uppercase tracking-[0.14em]">
            {task.executionPathUsed.replaceAll('_', ' ')}
          </span>
        </div>
        {task.resultPreview ? (
          <div className="border-l border-white/15 pl-3 text-sm text-foreground/70">
            {task.resultPreview}
          </div>
        ) : null}
        {task.requestedChangesReason ? (
          <div className="border-l border-amber-400/40 pl-3 text-sm text-amber-200">
            Requested changes: {task.requestedChangesReason}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 lg:justify-end">
        {showReviewActions ? (
          <>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.DEFAULT}
              disabled={isBusy}
              onClick={() => void onApprove(task.id)}
            >
              Approve
            </Button>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              disabled={isBusy}
              onClick={() => void onRequestChanges(task.id)}
            >
              Request Changes
            </Button>
          </>
        ) : null}
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={isBusy}
          onClick={() => void onDismiss(task.id)}
        >
          Dismiss
        </Button>
        <Button
          size={ButtonSize.SM}
          variant={ButtonVariant.SECONDARY}
          disabled={isBusy}
          onClick={() => void onPlanNextSteps(task)}
        >
          Plan Next Steps
        </Button>
        <AppLink
          url={getAdvancedToolHref(task)}
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          className="font-semibold"
          label="Open Tool"
        />
      </div>
    </article>
  );
}

function WorkspaceTaskInspector({
  busyTaskId,
  onApprove,
  onDismiss,
  onOpenChange,
  onPlanNextSteps,
  onRequestChanges,
  task,
}: {
  busyTaskId: string | null;
  onApprove: (taskId: string) => Promise<void>;
  onDismiss: (taskId: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
  onPlanNextSteps: (task: WorkspaceTask) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  task: WorkspaceTask | null;
}) {
  const isBusy = busyTaskId === task?.id;
  const showReviewActions = task?.reviewState === 'pending_approval';
  const linkedIssueSummary = useWorkspaceTaskLinkedIssue(task);
  const linkedRunSummary = useWorkspaceTaskLinkedRunSummary(task);
  const linkedOutputSummary = useWorkspaceTaskLinkedOutputs(task);
  const taskToolHref =
    task && linkedRunSummary.reportThreadId
      ? `/chat/${linkedRunSummary.reportThreadId}`
      : task
        ? getAdvancedToolHref(task)
        : '/orchestration/runs';
  const taskToolLabel = linkedRunSummary.reportThreadId
    ? 'Open Report'
    : 'Open Tool';

  return (
    <Sheet open={Boolean(task)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-white/10 bg-[#090909] p-0 sm:max-w-2xl"
      >
        {task ? (
          <div
            className="flex min-h-full flex-col"
            data-testid="workspace-task-inspector"
          >
            <div className="border-b border-white/[0.08] px-6 py-5 pr-14">
              <SheetHeader className="space-y-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/65">
                    {formatTaskStatus(task)}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                    {task.outputType}
                  </span>
                  <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                    {task.executionPathUsed.replaceAll('_', ' ')}
                  </span>
                </div>

                <SheetTitle className="text-2xl tracking-[-0.03em]">
                  {task.title}
                </SheetTitle>
                <SheetDescription className="text-sm leading-6 text-foreground/55">
                  {task.request}
                </SheetDescription>
              </SheetHeader>
            </div>

            <div className="flex-1 space-y-6 px-6 py-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Card bodyClassName="space-y-2 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
                    Routing
                  </p>
                  <p className="text-sm text-foreground">
                    {task.routingSummary ??
                      'Auto-routed by workspace orchestration.'}
                  </p>
                </Card>
                <Card bodyClassName="space-y-2 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
                    Timeline
                  </p>
                  <div className="space-y-1 text-sm text-foreground/60">
                    <p className="flex items-center gap-2">
                      <HiOutlineClock className="h-4 w-4" />
                      Updated {formatTaskTimestamp(task)}
                    </p>
                    {task.createdAt ? (
                      <p>Created {new Date(task.createdAt).toLocaleString()}</p>
                    ) : null}
                    {task.completedAt ? (
                      <p>
                        Completed {new Date(task.completedAt).toLocaleString()}
                      </p>
                    ) : null}
                  </div>
                </Card>
              </div>

              {task.resultPreview ? (
                <Card
                  label="Result preview"
                  bodyClassName="border-l border-emerald-400/30 p-4 text-sm text-foreground/75"
                >
                  {task.resultPreview}
                </Card>
              ) : null}

              {task.linkedOutputIds.length > 0 ? (
                <Card
                  label="Created outputs"
                  bodyClassName="space-y-3 border-l border-emerald-400/25 p-4 text-sm text-foreground/75"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-foreground/70">
                      Linked ingredient outputs created for this task.
                    </p>
                    <AppLink
                      url="/library/ingredients"
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                      className="font-semibold"
                      label="Open library"
                    />
                  </div>

                  {linkedOutputSummary.isLoading ? (
                    <p>Loading linked outputs…</p>
                  ) : null}

                  {linkedOutputSummary.error ? (
                    <p className="text-amber-200">
                      {linkedOutputSummary.error}
                    </p>
                  ) : null}

                  {linkedOutputSummary.outputs.length > 0 ? (
                    <div
                      className="space-y-3"
                      data-testid="workspace-task-linked-outputs"
                    >
                      {linkedOutputSummary.outputs.map((output) => {
                        const description =
                          getWorkspaceLinkedOutputDescription(output);

                        return (
                          <article
                            key={output.id}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-foreground">
                                {getWorkspaceLinkedOutputTitle(output)}
                              </p>
                              <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                                {output.category ?? task.outputType}
                              </span>
                            </div>
                            {description ? (
                              <p className="mt-2 line-clamp-3 text-sm text-foreground/60">
                                {description}
                              </p>
                            ) : null}
                            <p className="mt-2 text-xs text-foreground/40">
                              ID: {output.id}
                            </p>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </Card>
              ) : null}

              {linkedRunSummary.reportThreadId ? (
                <Card
                  label="Report location"
                  bodyClassName="space-y-3 border-l border-sky-400/30 p-4 text-sm text-foreground/75"
                >
                  <p>
                    This task&apos;s report lives in the linked agent thread,
                    not in the workspace task record itself.
                  </p>
                  <AppLink
                    url={`/chat/${linkedRunSummary.reportThreadId}`}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    className="font-semibold"
                    label="Open report thread"
                  />
                </Card>
              ) : null}

              {task.failureReason ? (
                <Card
                  label="Failure"
                  bodyClassName="border-l border-rose-400/35 p-4 text-sm text-rose-200"
                >
                  {task.failureReason}
                </Card>
              ) : null}

              {task.requestedChangesReason ? (
                <Card
                  label="Requested changes"
                  bodyClassName="border-l border-amber-400/35 p-4 text-sm text-amber-200"
                >
                  {task.requestedChangesReason}
                </Card>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <Card
                  label="Task metadata"
                  bodyClassName="space-y-2 p-4 text-sm text-foreground/65"
                >
                  <p>Priority: {task.priority}</p>
                  <p>Review state: {task.reviewState.replaceAll('_', ' ')}</p>
                  <p>Organization: {task.organization}</p>
                  {task.brand ? <p>Brand: {task.brand}</p> : null}
                </Card>

                <Card
                  label="Linked records"
                  bodyClassName="space-y-2 p-4 text-sm text-foreground/65"
                >
                  <p>Runs: {task.linkedRunIds.length}</p>
                  {task.linkedIssueId ? (
                    <p>
                      Issue:{' '}
                      {linkedIssueSummary.isLoading
                        ? 'Loading…'
                        : (linkedIssueSummary.identifier ?? 'Unavailable')}
                    </p>
                  ) : null}
                  <p>Outputs: {task.linkedOutputIds.length}</p>
                  <p>
                    Report threads:{' '}
                    {linkedRunSummary.isLoading
                      ? 'Loading…'
                      : linkedRunSummary.reportThreadCount}
                  </p>
                  <p>
                    Generated content:{' '}
                    {linkedRunSummary.isLoading
                      ? 'Loading…'
                      : linkedRunSummary.generatedContentCount}
                  </p>
                  <p>Approvals: {task.linkedApprovalIds.length}</p>
                  {task.planningThreadId ? (
                    <p className="truncate">Thread: {task.planningThreadId}</p>
                  ) : null}
                </Card>
              </div>
            </div>

            <div className="border-t border-white/[0.08] px-6 py-4">
              <div className="flex flex-wrap gap-2">
                {showReviewActions ? (
                  <>
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.DEFAULT}
                      disabled={isBusy}
                      onClick={() => void onApprove(task.id)}
                    >
                      Approve
                    </Button>
                    <Button
                      size={ButtonSize.SM}
                      variant={ButtonVariant.SECONDARY}
                      disabled={isBusy}
                      onClick={() => void onRequestChanges(task.id)}
                    >
                      Request Changes
                    </Button>
                  </>
                ) : null}

                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  disabled={isBusy}
                  onClick={() => void onDismiss(task.id)}
                >
                  Dismiss
                </Button>
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.SECONDARY}
                  disabled={isBusy}
                  onClick={() => void onPlanNextSteps(task)}
                >
                  Plan Next Steps
                </Button>
                {linkedIssueSummary.href ? (
                  <AppLink
                    url={linkedIssueSummary.href}
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    className="font-semibold"
                    label="Open Issue"
                  />
                ) : null}
                <AppLink
                  url={taskToolHref}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  className="font-semibold"
                  label={taskToolLabel}
                />
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export default function WorkspacePageContent({
  defaultInboxView = 'unread',
  initialActiveRuns = [],
  initialAnalytics,
  initialReviewInbox = DEFAULT_REVIEW_INBOX,
  initialRuns = [],
  initialStats = null,
  initialTimeSeriesData,
  section = 'overview',
}: WorkspacePageContentProps) {
  void initialAnalytics;
  void initialTimeSeriesData;

  const { getToken } = useAuth();
  const { brandId, brands, organizationId, selectedBrand } = useBrand();
  const router = useRouter();
  const [isTaskComposerOpen, setTaskComposerOpen] = useState(false);
  const [taskRequest, setTaskRequest] = useState('');
  const [taskOutputType, setTaskOutputType] =
    useState<(typeof TASK_PRESETS)[number]['outputType']>('ingredient');
  const [taskMode, setTaskMode] = useState<WorkspaceTaskMode>('standard');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskEnhancementBusy, setTaskEnhancementBusy] = useState(false);
  const [previousTaskRequest, setPreviousTaskRequest] = useState<string | null>(
    null,
  );
  const [taskTargetBrandId, setTaskTargetBrandId] = useState<string | null>(
    null,
  );
  const [taskTargetBrandLabel, setTaskTargetBrandLabel] = useState<
    string | null
  >(null);
  const [workspaceActionError, setWorkspaceActionError] = useState<
    string | null
  >(null);
  const [isWorkspaceRefreshing, setWorkspaceRefreshing] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [workspaceTasks, setWorkspaceTasks] = useState<WorkspaceTask[]>([]);
  const availableBrandMentions = useMemo<WorkspaceBrandMentionItem[]>(
    () =>
      brands.map((brand) => ({
        id: brand.id,
        label: brand.label ?? 'Untitled brand',
      })),
    [brands],
  );
  const selectedTargetBrandLabel = useMemo(
    () => taskTargetBrandLabel || getBrandDisplayLabel(selectedBrand),
    [selectedBrand, taskTargetBrandLabel],
  );
  const clearTaskComposerHash = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      !window.location.hash.includes('new-task')
    ) {
      return;
    }

    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`,
    );
  }, []);
  const effectiveTaskBrandId = taskTargetBrandId || brandId || undefined;
  const taskBrandSuggestion = useMemo(
    () => ({
      items: ({ query }: { query: string }) => {
        const normalizedQuery = query.trim().toLowerCase();
        if (!normalizedQuery) {
          return availableBrandMentions;
        }

        return availableBrandMentions.filter((item) =>
          item.label.toLowerCase().includes(normalizedQuery),
        );
      },
      render: () => {
        let component: ReactRenderer;
        let popup: Instance[];

        return {
          onExit: () => {
            popup?.[0]?.destroy();
            component.destroy();
          },
          onKeyDown: (props: { event: KeyboardEvent }) => {
            if (props.event.key === 'Escape') {
              popup?.[0]?.hide();
              return true;
            }

            return (
              (
                component.ref as {
                  onKeyDown: (value: { event: KeyboardEvent }) => boolean;
                }
              )?.onKeyDown(props) ?? false
            );
          },
          onStart: (props: Record<string, unknown>) => {
            component = new ReactRenderer(WorkspaceBrandMentionList, {
              editor: props.editor as Editor,
              props,
            });
            popup = tippy('body', {
              appendTo: () => document.body,
              content: component.element,
              getReferenceClientRect: props.clientRect as () => DOMRect,
              interactive: true,
              placement: 'bottom-start',
              showOnCreate: true,
              trigger: 'manual',
            });
          },
          onUpdate: (props: Record<string, unknown>) => {
            component.updateProps(props);
            popup?.[0]?.setProps({
              getReferenceClientRect: props.clientRect as () => DOMRect,
            });
          },
        };
      },
    }),
    [availableBrandMentions],
  );
  const taskTargetEditor = useEditor({
    content: '',
    editorProps: {
      attributes: {
        'aria-label': 'Target brand',
        class:
          'prose prose-sm prose-invert max-w-none min-h-11 rounded-lg border border-white/10 bg-black/30 px-4 py-2 text-sm text-foreground focus:outline-none',
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        listItem: false,
        orderedList: false,
      }),
      Placeholder.configure({
        placeholder: selectedBrand
          ? `Type @ to target a different brand. Defaults to ${getBrandDisplayLabel(selectedBrand)}.`
          : 'Type @ to target a brand.',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'mention',
        },
        renderText({ node }) {
          return `@${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: taskBrandSuggestion as unknown as Omit<
          SuggestionOptions<unknown, MentionNodeAttrs>,
          'editor'
        >,
      }).extend({
        addAttributes() {
          return {
            id: { default: null },
            label: { default: null },
          };
        },
      }),
    ],
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const match = extractBrandMentionMatch(editor.getJSON());
      setTaskTargetBrandId(match?.id ?? null);
      setTaskTargetBrandLabel(match?.label ?? null);
    },
  });
  const listenForEnhancedTaskRequest = useWebsocketPrompt<string>({
    errorMessage: 'Task enhancement failed. Please try again.',
    onError: () => {
      setTaskEnhancementBusy(false);
    },
    onSuccess: (result) => {
      setTaskRequest(result);
      setTaskEnhancementBusy(false);
    },
    onTimeout: () => {
      setTaskEnhancementBusy(false);
    },
    timeoutMessage: 'Task enhancement timed out. Please try again.',
  });

  const reviewInboxTasks = useMemo(
    () =>
      workspaceTasks.filter(
        (task) =>
          task.reviewState === 'pending_approval' ||
          task.reviewState === 'changes_requested' ||
          task.status === 'completed' ||
          task.status === 'failed',
      ),
    [workspaceTasks],
  );

  const queueTasks = useMemo(
    () =>
      workspaceTasks
        .filter(isTaskInInboxQueue)
        .slice()
        .sort((left, right) => {
          const leftTime = new Date(
            left.updatedAt ?? left.createdAt ?? 0,
          ).getTime();
          const rightTime = new Date(
            right.updatedAt ?? right.createdAt ?? 0,
          ).getTime();
          return rightTime - leftTime;
        }),
    [workspaceTasks],
  );

  const unreadInboxTasks = useMemo(
    () => queueTasks.filter(isUnreadInboxTask),
    [queueTasks],
  );

  const recentInboxTasks = useMemo(() => queueTasks.slice(0, 8), [queueTasks]);

  const inProgressTasks = useMemo(
    () =>
      workspaceTasks.filter(
        (task) => task.status === 'triaged' || task.status === 'in_progress',
      ),
    [workspaceTasks],
  );

  const activityItems = useMemo(
    () =>
      workspaceTasks.slice().sort((left, right) => {
        const leftTime = new Date(
          left.updatedAt ?? left.createdAt ?? 0,
        ).getTime();
        const rightTime = new Date(
          right.updatedAt ?? right.createdAt ?? 0,
        ).getTime();
        return rightTime - leftTime;
      }),
    [workspaceTasks],
  );
  const historyPreviewItems = useMemo(
    () => activityItems.slice(0, 5),
    [activityItems],
  );
  const selectedTask = useMemo(
    () => workspaceTasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, workspaceTasks],
  );
  const visibleInboxTasks = useMemo(() => {
    switch (defaultInboxView) {
      case 'unread':
        return unreadInboxTasks;
      case 'all':
        return queueTasks;
      default:
        return recentInboxTasks;
    }
  }, [defaultInboxView, queueTasks, recentInboxTasks, unreadInboxTasks]);

  const summaryItems = useMemo(
    () => [
      {
        label: 'Inbox',
        value: String(queueTasks.length),
      },
      {
        label: 'In Progress',
        value: String(inProgressTasks.length + initialActiveRuns.length),
      },
      {
        label: 'Recent Outputs',
        value: String(initialReviewInbox.recentItems.length),
      },
      {
        label: 'Completed Today',
        value: String(initialStats?.completedToday ?? 0),
      },
    ],
    [
      initialActiveRuns.length,
      initialStats,
      inProgressTasks.length,
      queueTasks.length,
      initialReviewInbox.recentItems.length,
    ],
  );

  useEffect(() => {
    if (
      selectedTaskId &&
      !workspaceTasks.some((task) => task.id === selectedTaskId)
    ) {
      setSelectedTaskId(null);
    }
  }, [selectedTaskId, workspaceTasks]);

  useEffect(() => {
    const controller = new AbortController();

    const loadWorkspaceTasks = async () => {
      const token = await resolveClerkToken(getToken);
      if (!token || controller.signal.aborted) {
        return;
      }

      const service = WorkspaceTasksService.getInstance(token);
      const tasks = await service.list({ limit: 24 });
      if (!controller.signal.aborted) {
        setWorkspaceTasks(tasks);
      }
    };

    void loadWorkspaceTasks();

    return () => {
      controller.abort();
    };
  }, [getToken]);

  const refreshWorkspaceTasks = async () => {
    setWorkspaceRefreshing(true);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        return;
      }

      const service = WorkspaceTasksService.getInstance(token);
      const tasks = await service.list({ limit: 24 });
      startTransition(() => {
        setWorkspaceTasks(tasks);
      });
    } finally {
      setWorkspaceRefreshing(false);
    }
  };

  const handleEnhanceTaskRequest = useCallback(async () => {
    const normalizedRequest = taskRequest.trim();

    if (!normalizedRequest) {
      setTaskError('Add a task request before enhancing it.');
      return;
    }

    if (!organizationId) {
      setTaskError('Organization context unavailable.');
      return;
    }

    setPreviousTaskRequest(taskRequest);
    setTaskEnhancementBusy(true);
    setTaskError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        setTaskError('Authentication token unavailable.');
        setTaskEnhancementBusy(false);
        return;
      }

      const service = PromptsService.getInstance(token);
      const prompt = await service.post(
        new Prompt({
          brand: effectiveTaskBrandId,
          category: PromptCategory.ARTICLE,
          isSkipEnhancement: false,
          organization: organizationId,
          original: normalizedRequest,
          systemPromptKey: SystemPromptKey.DEFAULT,
          useRAG: true,
        }),
      );

      listenForEnhancedTaskRequest(prompt.id);
    } catch (error) {
      setTaskError(
        error instanceof Error
          ? error.message
          : 'Failed to enhance the task request.',
      );
      setTaskEnhancementBusy(false);
    }
  }, [
    effectiveTaskBrandId,
    getToken,
    listenForEnhancedTaskRequest,
    organizationId,
    taskRequest,
  ]);

  const handleUndoTaskEnhancement = useCallback(() => {
    if (previousTaskRequest === null) {
      return;
    }

    setTaskRequest(previousTaskRequest);
    setPreviousTaskRequest(null);
    setTaskError(null);
  }, [previousTaskRequest]);

  const buildTaskSubmission = useCallback(() => {
    const normalizedRequest = taskRequest.trim();
    const targetLabel = selectedTargetBrandLabel;

    if (taskMode === 'research') {
      return {
        brand: effectiveTaskBrandId,
        outputType: 'ingredient' as const,
        request: `Research this request for ${targetLabel} and return a concise report with key findings, implications, and recommended next steps.\n\nFocus: ${normalizedRequest}`,
        title: `Research brief · ${targetLabel}`,
      };
    }

    if (taskMode === 'trends') {
      return {
        brand: effectiveTaskBrandId,
        outputType: 'ingredient' as const,
        request: `Analyze current trends relevant to ${targetLabel} and return a trend report with key signals, opportunities, content angles, and recommendations.\n\nFocus: ${normalizedRequest}`,
        title: `Trends report · ${targetLabel}`,
      };
    }

    return {
      brand: effectiveTaskBrandId,
      outputType: taskOutputType,
      request: normalizedRequest,
    };
  }, [
    effectiveTaskBrandId,
    selectedTargetBrandLabel,
    taskMode,
    taskOutputType,
    taskRequest,
  ]);

  const handleCreateTask = async () => {
    if (!taskRequest.trim()) {
      setTaskError('Describe what you want Genfeed to create.');
      return;
    }

    setTaskBusy(true);
    setTaskError(null);
    setWorkspaceActionError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        setTaskError('Authentication token unavailable.');
        return;
      }

      const service = WorkspaceTasksService.getInstance(token);
      const createdTask = await service.createTask(buildTaskSubmission());

      startTransition(() => {
        setWorkspaceTasks((current) => [createdTask, ...current]);
        setTaskRequest('');
        setTaskMode('standard');
        setTaskError(null);
        setPreviousTaskRequest(null);
      });
      taskTargetEditor?.commands.clearContent();
      setTaskTargetBrandId(null);
      setTaskTargetBrandLabel(null);
      setTaskComposerOpen(false);
      clearTaskComposerHash();
    } catch (error) {
      setTaskError(
        error instanceof Error ? error.message : 'Failed to create task.',
      );
    } finally {
      setTaskBusy(false);
    }
  };

  const mutateTask = async (
    taskId: string,
    operation: (service: WorkspaceTasksService) => Promise<WorkspaceTask>,
  ) => {
    setBusyTaskId(taskId);
    setWorkspaceActionError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        return;
      }

      const service = WorkspaceTasksService.getInstance(token);
      const updatedTask = await operation(service);
      startTransition(() => {
        setWorkspaceTasks((current) =>
          current.map((task) =>
            task.id === updatedTask.id ? updatedTask : task,
          ),
        );
      });
    } catch (error) {
      setWorkspaceActionError(
        error instanceof Error
          ? error.message
          : 'Failed to update the workspace task.',
      );
    } finally {
      setBusyTaskId(null);
    }
  };

  const openPlanningConversation = async (task: WorkspaceTask) => {
    setBusyTaskId(task.id);
    setWorkspaceActionError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        setWorkspaceActionError('Authentication token unavailable.');
        return;
      }

      const service = WorkspaceTasksService.getInstance(token);
      const planningThread = await service.ensurePlanningThread(task.id);

      startTransition(() => {
        setWorkspaceTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  planningThreadId: planningThread.threadId,
                }
              : item,
          ),
        );
      });

      router.push(`/chat/${planningThread.threadId}`);
    } catch (error) {
      setWorkspaceActionError(
        error instanceof Error
          ? error.message
          : 'Failed to open the planning conversation.',
      );
    } finally {
      setBusyTaskId(null);
    }
  };

  const isOverviewSection = section === 'overview';
  const isInboxSection = section === 'inbox';
  const sectionCopy = SECTION_COPY[section];
  const shouldShowComposer = isOverviewSection;
  const shouldShowInbox = section === 'overview' || section === 'inbox';
  const shouldShowHistory = section === 'activity';
  const shouldShowSectionSnapshot = section === 'activity';

  useEffect(() => {
    if (!isOverviewSection || typeof window === 'undefined') {
      return;
    }

    const openComposerFromHash = () => {
      if (!window.location.hash.includes('new-task')) {
        return;
      }

      if (window.location.hash !== '#new-task') {
        window.history.replaceState(
          null,
          '',
          `${window.location.pathname}${window.location.search}#new-task`,
        );
      }

      setTaskComposerOpen(true);
    };

    openComposerFromHash();
    window.addEventListener('hashchange', openComposerFromHash);

    return () => {
      window.removeEventListener('hashchange', openComposerFromHash);
    };
  }, [isOverviewSection]);

  const renderTaskStream = (
    tasks: WorkspaceTask[],
    emptyMessage: string,
  ): ReactNode =>
    tasks.length > 0 ? (
      <div className="divide-y divide-white/[0.06]">
        {tasks.map((task) => (
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
      <p className="text-sm text-foreground/45">{emptyMessage}</p>
    );

  const renderTaskRows = (
    tasks: WorkspaceTask[],
    emptyMessage: string,
  ): ReactNode =>
    tasks.length > 0 ? (
      <div className="divide-y divide-white/[0.06]">
        {tasks.map((task) => (
          <WorkspaceTaskRow
            key={task.id}
            task={task}
            onOpen={(openedTask) => setSelectedTaskId(openedTask.id)}
          />
        ))}
      </div>
    ) : (
      <AppTable<WorkspaceTask>
        items={[]}
        columns={[]}
        emptyLabel={emptyMessage}
      />
    );

  const workspaceHeaderActions = (
    <div className="flex flex-wrap gap-2">
      {shouldShowComposer ? (
        <Button
          className="rounded-md"
          data-testid="workspace-new-task"
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          onClick={() => setTaskComposerOpen(true)}
        >
          New Task
        </Button>
      ) : null}
      <ButtonRefresh
        className="rounded-md"
        onClick={() => void refreshWorkspaceTasks()}
        isRefreshing={isWorkspaceRefreshing}
      />
      {isInboxSection ? (
        <AppLink
          className="rounded-md"
          url="/workspace/activity"
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          label="Open Activity"
        />
      ) : null}
    </div>
  );

  return (
    <Container
      label={sectionCopy.title}
      description={sectionCopy.description}
      icon={HiOutlineSquares2X2}
      className="py-8"
      promoteHeaderToTopbarOnScroll
      topbarRight={workspaceHeaderActions}
      {...(isInboxSection
        ? {
            activeTab: defaultInboxView,
            headerTabs: {
              activeTab: defaultInboxView,
              fullWidth: false,
              items: INBOX_VIEW_OPTIONS.map((option) => {
                const count =
                  option.id === 'unread'
                    ? unreadInboxTasks.length
                    : option.id === 'recent'
                      ? recentInboxTasks.length
                      : queueTasks.length;

                return {
                  badge: (
                    <span className="text-[11px] opacity-70">{count}</span>
                  ),
                  href: `/workspace/inbox/${option.id}`,
                  id: option.id,
                  label: option.label,
                };
              }),
              size: 'sm' as const,
              variant: 'pills' as const,
            },
          }
        : {})}
      right={workspaceHeaderActions}
    >
      {workspaceActionError ? (
        <p className="mb-8 rounded-2xl border border-rose-400/30 bg-rose-400/8 px-4 py-3 text-sm text-rose-200">
          {workspaceActionError}
        </p>
      ) : null}

      <Modal.Root
        open={isTaskComposerOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTaskError(null);
            clearTaskComposerHash();
          }
          setTaskComposerOpen(open);
        }}
      >
        <Modal.Content size="lg" className="border-white/10 bg-[#111111]">
          <Modal.Header>
            <Modal.Title>Start a task</Modal.Title>
            <Modal.Description>
              Describe the outcome you want. Genfeed routes it automatically.
            </Modal.Description>
          </Modal.Header>

          <Modal.Body className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {TASK_PRESETS.map((preset) => (
                <Button
                  key={preset.outputType}
                  size={ButtonSize.SM}
                  variant={
                    taskOutputType === preset.outputType
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  className="font-semibold uppercase tracking-[0.14em]"
                  disabled={taskMode !== 'standard'}
                  onClick={() => setTaskOutputType(preset.outputType)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Task mode</p>
              <div className="flex flex-wrap gap-2">
                {TASK_MODE_OPTIONS.map((mode) => (
                  <Button
                    key={mode.id}
                    size={ButtonSize.SM}
                    variant={
                      taskMode === mode.id
                        ? ButtonVariant.DEFAULT
                        : ButtonVariant.SECONDARY
                    }
                    className="font-semibold"
                    onClick={() => setTaskMode(mode.id)}
                  >
                    {mode.label}
                  </Button>
                ))}
              </div>
              <p className="text-xs text-foreground/45">
                {
                  TASK_MODE_OPTIONS.find((mode) => mode.id === taskMode)
                    ?.description
                }
              </p>
              {taskMode !== 'standard' ? (
                <p className="text-xs text-foreground/35">
                  Research and trends requests are submitted as report-style
                  orchestration tasks, so output type selection is ignored.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-sm font-medium text-foreground">
                  Target brand
                </label>
                {taskTargetBrandId ? (
                  <Button
                    size={ButtonSize.XS}
                    variant={ButtonVariant.GHOST}
                    className="px-2 text-xs text-foreground/55"
                    onClick={() => {
                      taskTargetEditor?.commands.clearContent();
                      setTaskTargetBrandId(null);
                      setTaskTargetBrandLabel(null);
                    }}
                  >
                    Clear explicit target
                  </Button>
                ) : null}
              </div>
              {taskTargetEditor ? (
                <EditorContent editor={taskTargetEditor} />
              ) : (
                <div className="min-h-11 rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-foreground/35">
                  Type @ to target a brand.
                </div>
              )}
              <p className="text-xs text-foreground/45">
                Targeting{' '}
                <span className="font-medium text-foreground/70">
                  {selectedTargetBrandLabel}
                </span>
                {taskTargetBrandId ? ' from this modal' : ' by default'}.
              </p>
            </div>

            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="workspace-task-request"
                className="block text-sm font-medium text-foreground"
              >
                Task request
              </label>
              <div className="flex items-center gap-2">
                {previousTaskRequest ? (
                  <Button
                    size={ButtonSize.XS}
                    variant={ButtonVariant.GHOST}
                    className="px-2 text-xs text-foreground/55"
                    onClick={handleUndoTaskEnhancement}
                  >
                    Undo
                  </Button>
                ) : null}
                <Button
                  size={ButtonSize.XS}
                  variant={ButtonVariant.GHOST}
                  className="px-2 text-xs text-foreground/70"
                  disabled={taskEnhancementBusy || !taskRequest.trim()}
                  onClick={() => void handleEnhanceTaskRequest()}
                >
                  <HiOutlineSparkles className="h-3.5 w-3.5" />
                  {taskEnhancementBusy ? 'Enhancing…' : 'Enhance · 1 credit'}
                </Button>
              </div>
            </div>
            <textarea
              id="workspace-task-request"
              className="min-h-48 w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-foreground outline-none placeholder:text-foreground/35 focus:border-white/20"
              placeholder="Create three thumbnail directions for our next launch, then draft a caption."
              value={taskRequest}
              onChange={(event) => setTaskRequest(event.target.value)}
              onKeyDown={(event) => {
                if (
                  (event.metaKey || event.ctrlKey) &&
                  event.key === 'Enter' &&
                  !taskBusy
                ) {
                  event.preventDefault();
                  void handleCreateTask();
                }
              }}
            />
            <p className="text-xs text-foreground/45">
              Press Cmd/Ctrl + Enter to create the task.
            </p>

            {taskError ? (
              <p className="text-sm text-rose-300">{taskError}</p>
            ) : null}
          </Modal.Body>

          <Modal.Footer>
            <Modal.CloseButton asChild>
              <Button variant={ButtonVariant.SECONDARY} disabled={taskBusy}>
                Cancel
              </Button>
            </Modal.CloseButton>
            <Button
              variant={ButtonVariant.DEFAULT}
              disabled={taskBusy}
              onClick={() => void handleCreateTask()}
            >
              {taskBusy ? 'Creating...' : 'Create Task'}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>

      {isOverviewSection ? (
        <WorkspaceDashboard
          activeRuns={initialActiveRuns}
          reviewInbox={initialReviewInbox}
          runs={initialRuns}
          stats={initialStats}
        />
      ) : null}

      {shouldShowSectionSnapshot ? (
        <section data-testid="workspace-snapshot" className="space-y-4">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
              Workspace at a glance
            </h2>
          </div>
          <div className={WORKSPACE_CARD_GRID_GAP_CLASS}>
            {summaryItems.map((item) => (
              <Card
                key={item.label}
                className="h-full"
                bodyClassName="space-y-2 p-4"
              >
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
                  {item.label}
                </p>
                <div className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                  {item.value}
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {isOverviewSection ? null : (
        <div className={WORKSPACE_SECTION_STACK_CLASS}>
          <div className={WORKSPACE_SECTION_STACK_CLASS}>
            {isOverviewSection ? (
              <section id="task-queue" data-testid="workspace-task-list">
                <Card
                  label="Task queue"
                  description="Recent task requests across triage, active work, review, and completed output."
                  bodyClassName="space-y-4 p-5 sm:p-6"
                >
                  {renderTaskStream(
                    activityItems,
                    'No tasks yet. Start the first one from New Task.',
                  )}
                </Card>
              </section>
            ) : null}

            {shouldShowInbox ? (
              <section data-testid="workspace-inbox">
                {section === 'inbox' ? (
                  <Card
                    bodyClassName="p-5 sm:p-6"
                    data-testid="workspace-inbox-card"
                  >
                    {renderTaskRows(
                      visibleInboxTasks,
                      defaultInboxView === 'unread'
                        ? 'No unread inbox items right now.'
                        : 'No inbox items yet.',
                    )}
                  </Card>
                ) : (
                  <Card
                    label="Inbox"
                    description="Queue items that still need review or just finished moving."
                    headerAction={
                      <AppLink
                        url="/workspace/inbox/unread"
                        variant={ButtonVariant.SECONDARY}
                        size={ButtonSize.SM}
                        label="Open Inbox"
                      />
                    }
                    bodyClassName="space-y-4 p-5 sm:p-6"
                  >
                    <div className="flex flex-wrap gap-3 text-sm text-foreground/55">
                      <span>{unreadInboxTasks.length} unread</span>
                      <span>{recentInboxTasks.length} recent</span>
                      <span>{queueTasks.length} total</span>
                    </div>

                    {renderTaskRows(
                      reviewInboxTasks.slice(0, 5),
                      'No inbox items yet.',
                    )}
                  </Card>
                )}
              </section>
            ) : null}

            {shouldShowHistory ? (
              <section data-testid="workspace-activity">
                <Card
                  label="Activity"
                  description="The execution log, ordered by the latest update."
                  headerAction={
                    <AppLink
                      url="/workspace/inbox/unread"
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                      label="Open Inbox"
                    />
                  }
                  bodyClassName="space-y-4 p-5 sm:p-6"
                >
                  {renderTaskRows(
                    activityItems,
                    'Activity will appear here once tasks start running.',
                  )}
                </Card>
              </section>
            ) : null}

            {section === 'activity' ? (
              <section data-testid="workspace-advanced-tools">
                <Card
                  label="Operator tools"
                  description="Manual and expert surfaces stay available without taking over the main workspace flow."
                  bodyClassName="p-5 sm:p-6"
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
            ) : null}
          </div>

          {isOverviewSection ? (
            <div className={WORKSPACE_SECTION_STACK_CLASS}>
              <section data-testid="workspace-in-progress">
                <Card
                  label="In progress"
                  description="Active workspace tasks and live execution state."
                  bodyClassName="space-y-4 p-5 sm:p-6"
                >
                  {renderTaskStream(
                    inProgressTasks,
                    'No active workspace tasks right now.',
                  )}

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
                  bodyClassName="p-5 sm:p-6"
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
                              {new Date(item.createdAt).toLocaleString()}
                            </p>
                          </div>
                          {item.reviewDecision === 'approved' ? (
                            <HiOutlineCheckCircle className="h-5 w-5 text-emerald-300" />
                          ) : item.reviewDecision === 'request_changes' ? (
                            <HiOutlineClipboardDocumentCheck className="h-5 w-5 text-amber-300" />
                          ) : (
                            <HiOutlineInboxStack className="h-5 w-5 text-foreground/40" />
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground/45">
                      Recent outputs will appear here once the workspace starts
                      routing work.
                    </p>
                  )}
                </Card>
              </section>

              <section data-testid="workspace-history-preview">
                <Card
                  label="Recent activity"
                  description="Execution logs stay available without owning the main navigation."
                  headerAction={
                    <AppLink
                      url="/workspace/activity"
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                      label="Open Activity"
                    />
                  }
                  bodyClassName="p-5 sm:p-6"
                >
                  {renderTaskRows(
                    historyPreviewItems,
                    'Activity will appear here once the workspace starts routing work.',
                  )}
                </Card>
              </section>

              <section data-testid="workspace-library-snapshot">
                <Card
                  label="Library snapshot"
                  description="Keep the ingredient library one click away from the dashboard."
                  bodyClassName="p-5 sm:p-6"
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
                  bodyClassName="p-5 sm:p-6"
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
          ) : null}
        </div>
      )}

      <WorkspaceTaskInspector
        task={selectedTask}
        busyTaskId={busyTaskId}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTaskId(null);
          }
        }}
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
    </Container>
  );
}
