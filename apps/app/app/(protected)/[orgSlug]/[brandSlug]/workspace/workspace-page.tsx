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
import { useSocketManager } from '@hooks/utils/use-socket-manager/use-socket-manager';
import { useWebsocketPrompt } from '@hooks/utils/use-websocket-prompt/use-websocket-prompt';
import type { Ingredient } from '@models/content/ingredient.model';
import { Prompt } from '@models/content/prompt.model';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { AgentRunsService } from '@services/ai/agent-runs.service';
import { IngredientsService } from '@services/content/ingredients.service';
import { PromptsService } from '@services/content/prompts.service';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import {
  Task,
  type TaskEvent,
  TasksService,
} from '@services/management/tasks.service';
import { BrandsService } from '@services/social/brands.service';
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
import { Button as BaseButton, Button } from '@ui/primitives/button';
import { Checkbox } from '@ui/primitives/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@ui/primitives/sheet';
import { Textarea } from '@ui/primitives/textarea';
import { WebSocketPaths } from '@utils/network/websocket.util';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
import {
  buildTaskLaunchHref,
  OPERATOR_TASK_CONTEXT_QUERY_KEYS,
} from '@/lib/navigation/operator-shell';
import { OPEN_TASK_COMPOSER_EVENT } from '@/lib/workspace/task-composer-events';
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

interface WorkspaceTaskOutputGroup {
  children: Ingredient[];
  root: Ingredient;
}

interface WorkspaceTaskRealtimePayload {
  event: TaskEvent;
  organizationId: string;
  task: Task;
  taskId: string;
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
    label: 'Post',
    outputType: 'post' as const,
  },
  {
    label: 'Newsletter',
    outputType: 'newsletter' as const,
  },
  {
    label: 'Image',
    outputType: 'image' as const,
  },
  {
    label: 'Video',
    outputType: 'video' as const,
  },
  {
    label: 'Facecam',
    outputType: 'facecam' as const,
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

interface HeygenOption {
  id: string;
  label: string;
  preview?: string;
}

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
      'App activity, execution logs, and task progress across your account.',
    title: 'Activity',
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
        <BaseButton
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
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
        </BaseButton>
      ))}
    </div>
  );
});

function isTaskInInboxQueue(task: Task): boolean {
  return task.dismissedAt == null && task.reviewState !== 'dismissed';
}

function isUnreadInboxTask(task: Task): boolean {
  return (
    task.reviewState === 'pending_approval' ||
    task.reviewState === 'changes_requested' ||
    task.status === 'backlog' ||
    task.status === 'in_progress' ||
    task.status === 'in_review' ||
    task.status === 'failed'
  );
}

function formatTaskTimestamp(task: Task): string {
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

function formatTaskStatus(task: Task): string {
  if (task.dismissedAt != null) {
    return 'Dismissed';
  }

  switch (task.status) {
    case 'done':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'in_review':
      return task.reviewState === 'changes_requested'
        ? 'Changes Requested'
        : 'Needs Review';
    case 'in_progress':
      return 'In Progress';
    case 'backlog':
      return 'Triaged';
    default:
      return task.status;
  }
}

function getAdvancedToolHref(task: Task): string {
  return buildTaskLaunchHref(task, 'auto');
}

function getTaskStateDotClass(task: Task): string {
  if (task.status === 'failed') {
    return 'bg-rose-400';
  }

  if (
    task.reviewState === 'pending_approval' ||
    task.reviewState === 'changes_requested' ||
    task.status === 'in_review'
  ) {
    return 'bg-amber-300';
  }

  if (task.status === 'done') {
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
  task: Task | null,
): WorkspaceTaskLinkedRunSummary & { isLoading: boolean } {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedRunSummary>(
    getEmptyLinkedRunSummary(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const _linkedRunIdsKey = useMemo(
    () => task?.linkedRunIds?.join('|') ?? '',
    [task?.linkedRunIds],
  );

  useEffect(() => {
    if (!task || (task.linkedRunIds?.length ?? 0) === 0) {
      setSummary(getEmptyLinkedRunSummary());
      setIsLoading(false);
      return;
    }

    const capturedTask = task;
    const linkedRunIds = capturedTask.linkedRunIds ?? [];

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

function groupWorkspaceLinkedOutputs(
  outputs: Ingredient[],
): WorkspaceTaskOutputGroup[] {
  const activeOutputs = outputs.filter((output) => output.isDeleted !== true);
  const outputMap = new Map(activeOutputs.map((output) => [output.id, output]));
  const groups = new Map<string, WorkspaceTaskOutputGroup>();

  for (const output of activeOutputs) {
    const parentId =
      typeof output.parent === 'string'
        ? output.parent
        : (output.parent?.id ?? null);
    const rootId = parentId && outputMap.has(parentId) ? parentId : output.id;
    const root = outputMap.get(rootId) ?? output;
    const existingGroup = groups.get(rootId);

    if (!existingGroup) {
      groups.set(rootId, {
        children: root.id === output.id ? [] : [output],
        root,
      });
      continue;
    }

    if (output.id !== existingGroup.root.id) {
      existingGroup.children.push(output);
    }
  }

  return [...groups.values()].sort((left, right) => {
    const leftTime = new Date(left.root.updatedAt ?? left.root.createdAt ?? 0);
    const rightTime = new Date(
      right.root.updatedAt ?? right.root.createdAt ?? 0,
    );
    return rightTime.getTime() - leftTime.getTime();
  });
}

function formatWorkspaceEventLabel(event: TaskEvent): string {
  switch (event.type) {
    case 'task_queued':
      return 'Task queued';
    case 'task_started':
      return 'Task started';
    case 'runs_linked':
      return 'Runs linked';
    case 'run_queued':
      return 'Run queued';
    case 'run_started':
      return 'Run started';
    case 'run_completed':
      return 'Run completed';
    case 'run_failed':
      return 'Run failed';
    case 'task_ready_for_review':
      return 'Ready for review';
    case 'task_failed':
      return 'Task failed';
    case 'task_approved':
      return 'Task approved';
    case 'task_changes_requested':
      return 'Changes requested';
    case 'task_dismissed':
      return 'Task dismissed';
    case 'output_kept':
      return 'Output kept';
    case 'output_unkept':
      return 'Output removed from keep';
    case 'output_trashed':
      return 'Output trashed';
    default:
      return event.type.replaceAll('_', ' ');
  }
}

function getWorkspaceEventMessage(event: TaskEvent): string | null {
  const message = event.payload?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }

  const summary = event.payload?.summary;
  if (typeof summary === 'string' && summary.trim().length > 0) {
    return summary;
  }

  const resultPreview = event.payload?.resultPreview;
  if (typeof resultPreview === 'string' && resultPreview.trim().length > 0) {
    return resultPreview;
  }

  const reason = event.payload?.reason;
  if (typeof reason === 'string' && reason.trim().length > 0) {
    return reason;
  }

  const error = event.payload?.error;
  if (typeof error === 'string' && error.trim().length > 0) {
    return error;
  }

  return null;
}

function applyRealtimeTaskUpdate(
  currentTasks: Task[],
  payload: WorkspaceTaskRealtimePayload,
): Task[] {
  const nextTask = new Task(payload.task);
  const existingIndex = currentTasks.findIndex(
    (task) => task.id === payload.taskId,
  );

  if (existingIndex === -1) {
    return [nextTask, ...currentTasks];
  }

  return currentTasks.map((task, index) =>
    index === existingIndex ? nextTask : task,
  );
}

function useWorkspaceTaskLinkedOutputs(
  task: Task | null,
): WorkspaceTaskLinkedOutputSummary {
  const { getToken } = useAuth();
  const [summary, setSummary] = useState<WorkspaceTaskLinkedOutputSummary>(
    getEmptyLinkedOutputSummary(),
  );
  const _linkedOutputIdsKey = useMemo(
    () => task?.linkedOutputIds?.join('|') ?? '',
    [task?.linkedOutputIds],
  );

  useEffect(() => {
    if (!task || (task.linkedOutputIds?.length ?? 0) === 0) {
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
          new Set(capturedTask.linkedOutputIds ?? []),
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
  task: Task | null,
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

        const issue = await TasksService.getInstance(token).findOne(linkedId);

        if (isCancelled) {
          return;
        }

        setSummary({
          href: `/tasks/${issue.identifier}`,
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
  onOpen: (task: Task) => void;
  task: Task;
}) {
  const needsAttention = isUnreadInboxTask(task);

  return (
    <BaseButton
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
      ariaLabel={`Open details for ${task.title}`}
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
            {task.progress?.stage ? (
              <span>
                {task.progress.stage} · {task.progress.percent ?? 0}%
              </span>
            ) : null}
            {task.executionPathUsed ? (
              <span>{task.executionPathUsed.replaceAll('_', ' ')}</span>
            ) : null}
            <span>{formatTaskTimestamp(task)}</span>
          </div>
        </div>

        <HiArrowTopRightOnSquare className="mt-1 h-4 w-4 shrink-0 text-foreground/30" />
      </div>
    </BaseButton>
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
  onPlanNextSteps: (task: Task) => Promise<void>;
  onRequestChanges: (taskId: string) => Promise<void>;
  task: Task;
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
          {task.progress?.message ? <span>{task.progress.message}</span> : null}
          <span>{formatTaskTimestamp(task)}</span>
          {task.executionPathUsed ? (
            <span className="uppercase tracking-[0.14em]">
              {task.executionPathUsed.replaceAll('_', ' ')}
            </span>
          ) : null}
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
        <Button
          asChild
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
          className="font-semibold"
        >
          <Link href={getAdvancedToolHref(task)}>Open Tool</Link>
        </Button>
      </div>
    </article>
  );
}

function WorkspaceTaskInspector({
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
}: {
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
  const linkedOutputGroups = useMemo(
    () => groupWorkspaceLinkedOutputs(linkedOutputSummary.outputs),
    [linkedOutputSummary.outputs],
  );

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
                  {task.executionPathUsed ? (
                    <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                      {task.executionPathUsed.replaceAll('_', ' ')}
                    </span>
                  ) : null}
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
                    Progress
                  </p>
                  <div className="space-y-1 text-sm text-foreground/60">
                    <p>{task.progress?.stage ?? 'queued'}</p>
                    <p>{task.progress?.percent ?? 0}% complete</p>
                    <p>
                      {task.progress?.activeRunCount ?? 0} active run
                      {task.progress?.activeRunCount === 1 ? '' : 's'}
                    </p>
                    {task.progress?.message ? (
                      <p>{task.progress.message}</p>
                    ) : null}
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

              {(task.eventStream?.length ?? 0) > 0 ? (
                <Card
                  label="Task thread"
                  bodyClassName="space-y-3 border-l border-sky-400/30 p-4 text-sm text-foreground/75"
                >
                  <div
                    className="space-y-3"
                    data-testid="workspace-task-events"
                  >
                    {[...(task.eventStream ?? [])]
                      .slice()
                      .sort(
                        (left, right) =>
                          new Date(right.timestamp).getTime() -
                          new Date(left.timestamp).getTime(),
                      )
                      .map((event) => {
                        const message = getWorkspaceEventMessage(event);

                        return (
                          <article
                            key={event.id}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-foreground">
                                {formatWorkspaceEventLabel(event)}
                              </p>
                              <span className="text-xs text-foreground/40">
                                {event.timestamp
                                  ? new Date(event.timestamp).toLocaleString()
                                  : ''}
                              </span>
                            </div>
                            {message ? (
                              <p className="mt-2 text-sm text-foreground/60">
                                {message}
                              </p>
                            ) : null}
                          </article>
                        );
                      })}
                  </div>
                </Card>
              ) : null}

              {(task.linkedOutputIds?.length ?? 0) > 0 ? (
                <Card
                  label="Generated outputs"
                  bodyClassName="space-y-3 border-l border-emerald-400/25 p-4 text-sm text-foreground/75"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-foreground/70">
                      Review all active variants here. Kept outputs stay
                      visible; trashed variants disappear from the thread.
                    </p>
                    <Button
                      asChild
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                      className="font-semibold"
                    >
                      <Link href="/library/ingredients">Open library</Link>
                    </Button>
                  </div>

                  {linkedOutputSummary.isLoading ? (
                    <p>Loading linked outputs…</p>
                  ) : null}

                  {linkedOutputSummary.error ? (
                    <p className="text-amber-200">
                      {linkedOutputSummary.error}
                    </p>
                  ) : null}

                  {linkedOutputGroups.length > 0 ? (
                    <div
                      className="space-y-3"
                      data-testid="workspace-task-linked-outputs"
                    >
                      {linkedOutputGroups.map((group) => {
                        const outputs = [group.root, ...group.children];
                        return (
                          <article
                            key={group.root.id}
                            className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                          >
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-foreground">
                                {getWorkspaceLinkedOutputTitle(group.root)}
                              </p>
                              <span className="rounded-full border border-white/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/55">
                                {outputs.length} variant
                                {outputs.length === 1 ? '' : 's'}
                              </span>
                            </div>

                            <div className="space-y-3">
                              {outputs.map((output) => {
                                const description =
                                  getWorkspaceLinkedOutputDescription(output);
                                const isKept = (
                                  task.approvedOutputIds ?? []
                                ).includes(output.id);

                                return (
                                  <div
                                    key={output.id}
                                    className="rounded-lg border border-white/10 bg-black/30 p-3"
                                  >
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="space-y-1">
                                        <p className="font-medium text-foreground">
                                          {getWorkspaceLinkedOutputTitle(
                                            output,
                                          )}
                                        </p>
                                        <p className="text-xs text-foreground/40">
                                          {output.category ?? task.outputType}
                                          {output.id === group.root.id
                                            ? ' · parent'
                                            : ' · variant'}
                                        </p>
                                      </div>
                                      {isKept ? (
                                        <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                                          Kept
                                        </span>
                                      ) : null}
                                    </div>

                                    {description ? (
                                      <p className="mt-2 line-clamp-3 text-sm text-foreground/60">
                                        {description}
                                      </p>
                                    ) : null}

                                    <p className="mt-2 text-xs text-foreground/40">
                                      ID: {output.id}
                                    </p>

                                    <div className="mt-3 flex flex-wrap gap-2">
                                      <Button
                                        size={ButtonSize.SM}
                                        variant={ButtonVariant.SECONDARY}
                                        disabled={isBusy}
                                        onClick={() =>
                                          void (isKept
                                            ? onUnkeepOutput(task.id, output.id)
                                            : onKeepOutput(task.id, output.id))
                                        }
                                      >
                                        {isKept
                                          ? 'Remove from kept'
                                          : 'Keep output'}
                                      </Button>
                                      <Button
                                        size={ButtonSize.SM}
                                        variant={ButtonVariant.SECONDARY}
                                        disabled={isBusy}
                                        onClick={() =>
                                          void onTrashOutput(task.id, output.id)
                                        }
                                      >
                                        Trash
                                      </Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
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
                  <Button
                    asChild
                    variant={ButtonVariant.SECONDARY}
                    size={ButtonSize.SM}
                    className="font-semibold"
                  >
                    <Link href={`/chat/${linkedRunSummary.reportThreadId}`}>
                      Open report thread
                    </Link>
                  </Button>
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
                  <p>
                    Review state:{' '}
                    {task.reviewState?.replaceAll('_', ' ') ?? 'none'}
                  </p>
                  <p>Organization: {task.organization}</p>
                  {task.brand ? <p>Brand: {task.brand}</p> : null}
                </Card>

                <Card
                  label="Linked records"
                  bodyClassName="space-y-2 p-4 text-sm text-foreground/65"
                >
                  <p>Runs: {task.linkedRunIds?.length ?? 0}</p>
                  {task.linkedIssueId ? (
                    <p>
                      Issue:{' '}
                      {linkedIssueSummary.isLoading
                        ? 'Loading…'
                        : (linkedIssueSummary.identifier ?? 'Unavailable')}
                    </p>
                  ) : null}
                  <p>Outputs: {task.linkedOutputIds?.length ?? 0}</p>
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
                  <p>Approvals: {task.linkedApprovalIds?.length ?? 0}</p>
                  {task.planningThreadId ? (
                    <p className="truncate">Thread: {task.planningThreadId}</p>
                  ) : null}
                </Card>
              </div>
            </div>

            <div className="border-t border-white/[0.08] px-6 py-4 space-y-3">
              {showReviewActions ? (
                <div className="flex gap-2">
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
                </div>
              ) : null}

              <div className="flex gap-2">
                <Button
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
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
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={buildTaskLaunchHref(task, 'write')}>
                    Open in Write
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={buildTaskLaunchHref(task, 'generate')}>
                    Open in Generate
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={buildTaskLaunchHref(task, 'edit')}>
                    Open in Edit
                  </Link>
                </Button>
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={buildTaskLaunchHref(task, 'automate')}>
                    Open in Automate
                  </Link>
                </Button>
                {linkedIssueSummary.href ? (
                  <Button
                    asChild
                    variant={ButtonVariant.GHOST}
                    size={ButtonSize.SM}
                  >
                    <Link href={linkedIssueSummary.href}>Open Issue</Link>
                  </Button>
                ) : null}
                <Button
                  asChild
                  variant={ButtonVariant.GHOST}
                  size={ButtonSize.SM}
                >
                  <Link href={taskToolHref}>{taskToolLabel}</Link>
                </Button>
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
  const { subscribe } = useSocketManager();
  const { brandId, brands, organizationId, selectedBrand } = useBrand();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTaskId = searchParams?.get('taskId');
  const [isTaskComposerOpen, setTaskComposerOpen] = useState(false);
  const [taskRequest, setTaskRequest] = useState('');
  const [taskOutputType, setTaskOutputType] =
    useState<(typeof TASK_PRESETS)[number]['outputType']>('ingredient');
  const [facecamAvatars, setFacecamAvatars] = useState<HeygenOption[]>([]);
  const [facecamVoices, setFacecamVoices] = useState<HeygenOption[]>([]);
  const [facecamAvatarId, setFacecamAvatarId] = useState<string>('');
  const [facecamVoiceId, setFacecamVoiceId] = useState<string>('');
  const [facecamLoading, setFacecamLoading] = useState(false);
  const [facecamError, setFacecamError] = useState<string | null>(null);
  const [facecamSaveAsDefault, setFacecamSaveAsDefault] = useState(false);

  // Seed facecam picker defaults from brand.agentConfig when available.
  useEffect(() => {
    const config = (
      selectedBrand as { agentConfig?: Record<string, unknown> } | undefined
    )?.agentConfig;
    if (!config) return;
    const storedAvatar = config.heygenAvatarId as string | undefined;
    const storedVoice = config.heygenVoiceId as string | undefined;
    if (storedAvatar && !facecamAvatarId) {
      setFacecamAvatarId(storedAvatar);
    }
    if (storedVoice && !facecamVoiceId) {
      setFacecamVoiceId(storedVoice);
    }
  }, [selectedBrand, facecamAvatarId, facecamVoiceId]);

  // Fetch HeyGen avatars + voices on demand when the user switches to Facecam.
  useEffect(() => {
    if (
      taskOutputType !== 'facecam' ||
      (facecamAvatars.length > 0 && facecamVoices.length > 0)
    ) {
      return;
    }

    const controller = new AbortController();
    setFacecamLoading(true);
    setFacecamError(null);

    const run = async () => {
      try {
        const token = await resolveClerkToken(getToken);
        if (!token) {
          setFacecamError('Authentication token unavailable.');
          return;
        }

        const apiEndpoint = EnvironmentService.apiEndpoint;
        const headers = { Authorization: `Bearer ${token}` };

        const [avatarsResponse, voicesResponse] = await Promise.all([
          fetch(`${apiEndpoint}/heygen/avatars`, {
            headers,
            signal: controller.signal,
          }),
          fetch(`${apiEndpoint}/heygen/voices`, {
            headers,
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;

        if (!avatarsResponse.ok || !voicesResponse.ok) {
          const detail =
            !avatarsResponse.ok && avatarsResponse.status === 500
              ? 'HeyGen API key missing or invalid. Add one in Settings → API Keys, or set HEYGEN_KEY for self-hosted.'
              : `Avatars: ${avatarsResponse.status}, Voices: ${voicesResponse.status}`;
          setFacecamError(detail);
          return;
        }

        const avatarsJson = (await avatarsResponse.json()) as {
          data?: {
            attributes?: {
              avatars?: Array<{
                avatarId: string;
                name: string;
                preview?: string | null;
              }>;
            };
          };
        };
        const voicesJson = (await voicesResponse.json()) as {
          data?: {
            attributes?: {
              voices?: Array<{ voiceId: string; name: string }>;
            };
          };
        };

        const avatars = (avatarsJson.data?.attributes?.avatars ?? []).map(
          (a): HeygenOption => ({
            id: a.avatarId,
            label: a.name,
            preview: a.preview ?? undefined,
          }),
        );
        const voices = (voicesJson.data?.attributes?.voices ?? []).map(
          (v): HeygenOption => ({ id: v.voiceId, label: v.name }),
        );

        if (controller.signal.aborted) return;
        setFacecamAvatars(avatars);
        setFacecamVoices(voices);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load HeyGen avatars/voices.';
        setFacecamError(message);
      } finally {
        if (!controller.signal.aborted) {
          setFacecamLoading(false);
        }
      }
    };

    void run();
    return () => controller.abort();
  }, [taskOutputType, facecamAvatars.length, facecamVoices.length, getToken]);
  const [taskMode, setTaskMode] = useState<WorkspaceTaskMode>('standard');
  const [taskError, setTaskError] = useState<string | null>(null);
  const [taskEnhancementBusy, setTaskEnhancementBusy] = useState(false);
  const [taskKeepOpen, setTaskKeepOpen] = useState(false);
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
  const [workspaceTasks, setWorkspaceTasks] = useState<Task[]>([]);
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
          task.status === 'done' ||
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
        (task) => task.status === 'backlog' || task.status === 'in_progress',
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
  const replaceTaskSearchParam = useCallback(
    (taskId: string | null) => {
      const nextSearchParams = new URLSearchParams(searchParams?.toString());

      for (const key of OPERATOR_TASK_CONTEXT_QUERY_KEYS) {
        if (key !== 'taskId') {
          nextSearchParams.delete(key);
        }
      }

      if (taskId) {
        nextSearchParams.set('taskId', taskId);
      } else {
        nextSearchParams.delete('taskId');
      }

      const nextQuery = nextSearchParams.toString();
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
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
        label: 'Unread',
        value: String(unreadInboxTasks.length),
      },
      {
        label: 'In Progress',
        value: String(inProgressTasks.length + initialActiveRuns.length),
      },
      {
        label: 'Completed Today',
        value: String(initialStats?.completedToday ?? 0),
      },
      {
        label: 'Failed Today',
        value: String(initialStats?.failedToday ?? 0),
      },
    ],
    [
      initialActiveRuns.length,
      initialStats,
      inProgressTasks.length,
      unreadInboxTasks.length,
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
    if (!requestedTaskId) {
      return;
    }

    if (!workspaceTasks.some((task) => task.id === requestedTaskId)) {
      return;
    }

    if (selectedTaskId === requestedTaskId) {
      return;
    }

    setSelectedTaskId(requestedTaskId);
  }, [requestedTaskId, selectedTaskId, workspaceTasks]);

  useEffect(() => {
    const controller = new AbortController();

    const loadWorkspaceTasks = async () => {
      const token = await resolveClerkToken(getToken);
      if (!token || controller.signal.aborted) {
        return;
      }

      const service = TasksService.getInstance(token);
      const tasks = await service.list({});
      if (!controller.signal.aborted) {
        setWorkspaceTasks(tasks);
      }
    };

    void loadWorkspaceTasks();

    return () => {
      controller.abort();
    };
  }, [getToken]);

  useEffect(() => {
    if (!organizationId) {
      return;
    }

    const unsubscribeOverview = subscribe<WorkspaceTaskRealtimePayload>(
      WebSocketPaths.workspaceTaskOverview(organizationId),
      (payload) => {
        startTransition(() => {
          setWorkspaceTasks((current) =>
            applyRealtimeTaskUpdate(current, payload),
          );
        });
      },
    );

    return () => {
      unsubscribeOverview();
    };
  }, [organizationId, subscribe]);

  const refreshWorkspaceTasks = async () => {
    setWorkspaceRefreshing(true);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        return;
      }

      const service = TasksService.getInstance(token);
      const tasks = await service.list({});
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

    const base = {
      brand: effectiveTaskBrandId,
      outputType: taskOutputType,
      request: normalizedRequest,
      title: normalizedRequest.slice(0, 80),
    };

    if (taskOutputType === 'facecam') {
      return {
        ...base,
        heygenAvatarId: facecamAvatarId || undefined,
        heygenVoiceId: facecamVoiceId || undefined,
      };
    }

    return base;
  }, [
    effectiveTaskBrandId,
    facecamAvatarId,
    facecamVoiceId,
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

      const service = TasksService.getInstance(token);
      const submission = buildTaskSubmission();
      const createdTask = await service.createTask(submission);

      // Optional: persist HeyGen pickers as brand defaults.
      if (
        taskOutputType === 'facecam' &&
        facecamSaveAsDefault &&
        effectiveTaskBrandId &&
        (facecamAvatarId || facecamVoiceId)
      ) {
        try {
          const brandsService = BrandsService.getInstance(token);
          await brandsService.updateAgentConfig(effectiveTaskBrandId, {
            heygenAvatarId: facecamAvatarId || null,
            heygenVoiceId: facecamVoiceId || null,
          });
        } catch (brandError) {
          logger.error('Failed to persist HeyGen brand defaults', brandError);
        }
      }

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
      if (!taskKeepOpen) {
        setTaskComposerOpen(false);
      }
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
    operation: (service: TasksService) => Promise<Task>,
  ) => {
    setBusyTaskId(taskId);
    setWorkspaceActionError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        return;
      }

      const service = TasksService.getInstance(token);
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

  const openPlanningConversation = async (task: Task) => {
    setBusyTaskId(task.id);
    setWorkspaceActionError(null);

    try {
      const token = await resolveClerkToken(getToken);
      if (!token) {
        setWorkspaceActionError('Authentication token unavailable.');
        return;
      }

      const service = TasksService.getInstance(token);
      const planningThread = await service.ensurePlanningThread(task.id);

      startTransition(() => {
        setWorkspaceTasks((current) =>
          current.map((item) =>
            item.id === task.id
              ? new Task({
                  ...item,
                  planningThreadId: planningThread.threadId,
                })
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
  const shouldShowComposer = false;
  const shouldShowInbox = section === 'overview' || section === 'inbox';
  const shouldShowHistory = false;
  const shouldShowSectionSnapshot = section === 'inbox';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const openComposerFromSidebar = () => {
      setTaskComposerOpen(true);
    };

    window.addEventListener(OPEN_TASK_COMPOSER_EVENT, openComposerFromSidebar);

    return () => {
      window.removeEventListener(
        OPEN_TASK_COMPOSER_EVENT,
        openComposerFromSidebar,
      );
    };
  }, []);

  const renderTaskStream = (tasks: Task[], emptyMessage: string): ReactNode =>
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

  const renderTaskRows = (tasks: Task[], emptyMessage: string): ReactNode =>
    tasks.length > 0 ? (
      <div className="divide-y divide-white/[0.06]">
        {tasks.map((task) => (
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
      <AppTable<Task> items={[]} columns={[]} emptyLabel={emptyMessage} />
    );

  const workspaceHeaderActions = (
    <div className="flex flex-wrap gap-2">
      {shouldShowComposer ? (
        <Button
          data-testid="workspace-new-task"
          size={ButtonSize.SM}
          variant={ButtonVariant.DEFAULT}
          onClick={() => setTaskComposerOpen(true)}
        >
          New Task
        </Button>
      ) : null}
      <ButtonRefresh
        onClick={() => void refreshWorkspaceTasks()}
        isRefreshing={isWorkspaceRefreshing}
      />
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
          }
          setTaskComposerOpen(open);
        }}
      >
        <Modal.Content size="lg" className="border-white/10 bg-[#111111]">
          <Modal.Header>
            <Modal.Title>New Task</Modal.Title>
            <Modal.Description>
              Describe the outcome you want. Genfeed routes it automatically.
            </Modal.Description>
          </Modal.Header>

          <Modal.Body className="space-y-4">
            {/* Target brand */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <label className="block text-xs font-medium text-foreground/60">
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
                    Clear
                  </Button>
                ) : null}
              </div>
              {taskTargetEditor ? (
                <EditorContent editor={taskTargetEditor} />
              ) : (
                <div className="min-h-9 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-foreground/35">
                  Type @ to target a brand.
                </div>
              )}
              <p className="text-xs text-foreground/35">
                Targeting{' '}
                <span className="font-medium text-foreground/55">
                  {selectedTargetBrandLabel}
                </span>
                {taskTargetBrandId ? ' from this modal' : ' by default'}.
              </p>
            </div>

            {/* Task request */}
            <Textarea
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

            {/* Inline toolbar: output type + task mode + enhance */}
            <div className="flex flex-wrap items-center gap-2">
              {TASK_PRESETS.map((preset) => (
                <Button
                  key={preset.outputType}
                  size={ButtonSize.XS}
                  variant={
                    taskOutputType === preset.outputType
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  className="font-semibold uppercase tracking-[0.12em]"
                  disabled={taskMode !== 'standard'}
                  onClick={() => setTaskOutputType(preset.outputType)}
                >
                  {preset.label}
                </Button>
              ))}
              <span className="h-4 w-px bg-white/10" />
              {TASK_MODE_OPTIONS.map((mode) => (
                <Button
                  key={mode.id}
                  size={ButtonSize.XS}
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
              <div className="ml-auto flex items-center gap-1.5">
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

            {taskMode !== 'standard' ? (
              <p className="text-xs text-foreground/35">
                {
                  TASK_MODE_OPTIONS.find((mode) => mode.id === taskMode)
                    ?.description
                }
              </p>
            ) : null}

            {taskOutputType === 'facecam' ? (
              <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/55">
                    Facecam settings
                  </p>
                  {facecamLoading ? (
                    <span className="text-[11px] text-foreground/40">
                      Loading HeyGen…
                    </span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="facecam-avatar"
                      className="text-[11px] text-foreground/55"
                    >
                      Avatar
                    </label>
                    <Select
                      value={facecamAvatarId}
                      onValueChange={(value) => setFacecamAvatarId(value)}
                      disabled={facecamLoading || facecamAvatars.length === 0}
                    >
                      <SelectTrigger id="facecam-avatar">
                        <SelectValue placeholder="Pick an avatar" />
                      </SelectTrigger>
                      <SelectContent>
                        {facecamAvatars.map((avatar) => (
                          <SelectItem key={avatar.id} value={avatar.id}>
                            {avatar.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="facecam-voice"
                      className="text-[11px] text-foreground/55"
                    >
                      Voice
                    </label>
                    <Select
                      value={facecamVoiceId}
                      onValueChange={(value) => setFacecamVoiceId(value)}
                      disabled={facecamLoading || facecamVoices.length === 0}
                    >
                      <SelectTrigger id="facecam-voice">
                        <SelectValue placeholder="Pick a voice" />
                      </SelectTrigger>
                      <SelectContent>
                        {facecamVoices.map((voice) => (
                          <SelectItem key={voice.id} value={voice.id}>
                            {voice.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Checkbox
                  isChecked={facecamSaveAsDefault}
                  label="Save as brand default"
                  className="text-xs text-foreground/55"
                  onCheckedChange={(checked) =>
                    setFacecamSaveAsDefault(checked === true)
                  }
                />

                {facecamError ? (
                  <p className="text-[11px] text-rose-300">{facecamError}</p>
                ) : null}
              </div>
            ) : null}

            {taskError ? (
              <p className="text-sm text-rose-300">{taskError}</p>
            ) : null}
          </Modal.Body>

          <Modal.Footer>
            <Checkbox
              isChecked={taskKeepOpen}
              label="Add another task"
              className="mr-auto text-xs text-foreground/50"
              onCheckedChange={(checked) => setTaskKeepOpen(checked === true)}
            />
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
              {!taskBusy && <span className="ml-2 text-xs opacity-50">⌘↵</span>}
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
          workspaceTasks={workspaceTasks}
        />
      ) : null}

      {shouldShowSectionSnapshot ? (
        <section data-testid="workspace-snapshot" className="space-y-4 mb-6">
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
              <section data-testid="workspace-inbox" className="space-y-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
                  {section === 'inbox' ? defaultInboxView : 'Inbox'}
                </h2>
                <AppTable<Task>
                  items={
                    section === 'inbox'
                      ? visibleInboxTasks
                      : reviewInboxTasks.slice(0, 5)
                  }
                  emptyLabel={
                    section === 'inbox' && defaultInboxView === 'unread'
                      ? 'No unread inbox items right now.'
                      : 'No inbox items yet.'
                  }
                  getRowKey={(task) => task.id}
                  getItemId={(task) => task.id}
                  onRowClick={(task) => {
                    setSelectedTaskId(task.id);
                    replaceTaskSearchParam(task.id);
                  }}
                  columns={[
                    {
                      key: 'title',
                      header: 'Task',
                      render: (task) => (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              'h-2 w-2 shrink-0 rounded-full',
                              getTaskStateDotClass(task),
                            )}
                          />
                          <span className="truncate font-medium text-foreground">
                            {task.title}
                          </span>
                        </div>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      className: 'w-32',
                      render: (task) => (
                        <span className="text-xs text-foreground/60">
                          {formatTaskStatus(task)}
                        </span>
                      ),
                    },
                    {
                      key: 'executionPathUsed',
                      header: 'Path',
                      className: 'w-36 hidden lg:table-cell',
                      render: (task) => (
                        <span className="text-xs text-foreground/45">
                          {task.executionPathUsed?.replaceAll('_', ' ') ?? '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'updatedAt',
                      header: 'Updated',
                      className: 'w-28 text-right',
                      render: (task) => (
                        <span className="text-xs text-foreground/40">
                          {formatTaskTimestamp(task)}
                        </span>
                      ),
                    },
                  ]}
                />
              </section>
            ) : null}

            {shouldShowHistory ? (
              <section data-testid="workspace-activity" className="space-y-3">
                <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
                  Activity
                </h2>
                <AppTable<Task>
                  items={activityItems}
                  emptyLabel="Activity will appear here once tasks start running."
                  getRowKey={(task) => task.id}
                  getItemId={(task) => task.id}
                  onRowClick={(task) => {
                    setSelectedTaskId(task.id);
                    replaceTaskSearchParam(task.id);
                  }}
                  columns={[
                    {
                      key: 'title',
                      header: 'Task',
                      render: (task) => (
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={cn(
                              'h-2 w-2 shrink-0 rounded-full',
                              getTaskStateDotClass(task),
                            )}
                          />
                          <span className="truncate font-medium text-foreground">
                            {task.title}
                          </span>
                        </div>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      className: 'w-32',
                      render: (task) => (
                        <span className="text-xs text-foreground/60">
                          {formatTaskStatus(task)}
                        </span>
                      ),
                    },
                    {
                      key: 'executionPathUsed',
                      header: 'Path',
                      className: 'w-36 hidden lg:table-cell',
                      render: (task) => (
                        <span className="text-xs text-foreground/45">
                          {task.executionPathUsed?.replaceAll('_', ' ') ?? '—'}
                        </span>
                      ),
                    },
                    {
                      key: 'updatedAt',
                      header: 'Updated',
                      className: 'w-28 text-right',
                      render: (task) => (
                        <span className="text-xs text-foreground/40">
                          {formatTaskTimestamp(task)}
                        </span>
                      ),
                    },
                  ]}
                />
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
                    <Button
                      asChild
                      variant={ButtonVariant.SECONDARY}
                      size={ButtonSize.SM}
                    >
                      <Link href="/workspace/inbox/unread">Open Inbox</Link>
                    </Button>
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
        onKeepOutput={(taskId, outputId) =>
          mutateTask(taskId, (service) => service.keepOutput(taskId, outputId))
        }
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTaskId(null);
            replaceTaskSearchParam(null);
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
        onTrashOutput={(taskId, outputId) =>
          mutateTask(taskId, (service) => service.trashOutput(taskId, outputId))
        }
        onUnkeepOutput={(taskId, outputId) =>
          mutateTask(taskId, (service) =>
            service.unkeepOutput(taskId, outputId),
          )
        }
      />
    </Container>
  );
}
