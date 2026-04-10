'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { getRelativeTime } from '@helpers/formatting/date/date.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  type Issue,
  type IssuePriority,
  type IssueStatus,
  IssuesService,
} from '@services/management/issues.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ui/primitives';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { Textarea } from '@ui/primitives/textarea';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  HiOutlineExclamationTriangle,
  HiOutlineListBullet,
  HiOutlinePlusCircle,
  HiOutlineViewColumns,
} from 'react-icons/hi2';
import IssueOverlay, { openIssueOverlay } from './issue-overlay';

type ViewMode = 'kanban' | 'list';

const STATUS_ORDER: IssueStatus[] = [
  'backlog',
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
];

const STATUS_LABELS: Record<IssueStatus, string> = {
  backlog: 'Backlog',
  blocked: 'Blocked',
  cancelled: 'Cancelled',
  done: 'Done',
  in_progress: 'In Progress',
  in_review: 'In Review',
  todo: 'To Do',
};

const STATUS_COLORS: Record<IssueStatus, string> = {
  backlog: 'bg-white/10 text-white/50',
  blocked: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-white/5 text-white/30',
  done: 'bg-emerald-500/20 text-emerald-400',
  in_progress: 'bg-blue-500/20 text-blue-400',
  in_review: 'bg-amber-500/20 text-amber-400',
  todo: 'bg-white/15 text-white/70',
};

const PRIORITY_LABELS: Record<IssuePriority, string> = {
  critical: 'Critical',
  high: 'High',
  low: 'Low',
  medium: 'Medium',
};

const PRIORITY_COLORS: Record<IssuePriority, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  low: 'text-white/40',
  medium: 'text-white/60',
};

function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
        STATUS_COLORS[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function IssuePriorityIndicator({ priority }: { priority: IssuePriority }) {
  return (
    <span
      className={cn(
        'text-[10px] font-medium uppercase tracking-wider',
        PRIORITY_COLORS[priority],
      )}
    >
      {PRIORITY_LABELS[priority]}
    </span>
  );
}

function IssueRow({
  issue,
  onSelect,
}: {
  issue: Issue;
  onSelect: (issue: Issue) => void;
}) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      className="flex w-full items-center gap-4 border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]"
      onClick={() => onSelect(issue)}
    >
      <span className="w-20 shrink-0 text-xs font-mono text-white/40">
        {issue.identifier}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-white/90">
        {issue.title}
      </span>
      <IssuePriorityIndicator priority={issue.priority} />
      <IssueStatusBadge status={issue.status} />
      <span className="w-28 shrink-0 text-right text-xs text-white/30">
        {getRelativeTime(issue.updatedAt)}
      </span>
    </Button>
  );
}

function IssueCard({
  issue,
  onSelect,
}: {
  issue: Issue;
  onSelect: (issue: Issue) => void;
}) {
  return (
    <Button
      variant={ButtonVariant.UNSTYLED}
      className="block w-full rounded border border-white/5 bg-white/[0.02] p-3 text-left transition-colors hover:bg-white/[0.04]"
      onClick={() => onSelect(issue)}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-mono text-white/40">
          {issue.identifier}
        </span>
        <IssuePriorityIndicator priority={issue.priority} />
      </div>
      <p className="mb-2 text-sm leading-snug text-white/90">{issue.title}</p>
      {issue.assigneeUserId ? (
        <span className="text-[10px] text-white/30">Assigned</span>
      ) : null}
    </Button>
  );
}

function KanbanColumn({
  status,
  issues,
  onSelect,
}: {
  status: IssueStatus;
  issues: Issue[];
  onSelect: (issue: Issue) => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <IssueStatusBadge status={status} />
        <span className="text-xs text-white/30">{issues.length}</span>
      </div>
      <div className="flex flex-col gap-2">
        {issues.map((issue) => (
          <IssueCard issue={issue} key={issue.id} onSelect={onSelect} />
        ))}
        {issues.length === 0 ? (
          <div className="rounded border border-dashed border-white/10 p-4 text-center text-xs text-white/20">
            No issues
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function IssuesList() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [statusFilter, setStatusFilter] = useState<IssueStatus | ''>('');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');
  const [createPriority, setCreatePriority] = useState<IssuePriority>('medium');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const getIssuesService = useAuthedService((token) =>
    IssuesService.getInstance(token),
  );

  const loadIssues = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setIsLoading(true);
    try {
      const service = await getIssuesService();
      const params = statusFilter ? { status: statusFilter } : {};
      const result = await service.list(params);
      if (!controller.signal.aborted) {
        setIssues(result);
      }
    } catch {
      if (!controller.signal.aborted) {
        setIssues([]);
      }
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [getIssuesService, statusFilter]);

  const handleCreateIssue = useCallback(async () => {
    if (!createTitle.trim() || isCreating) return;
    setIsCreating(true);
    try {
      const service = await getIssuesService();
      await service.createIssue({
        description: createDescription.trim() || undefined,
        priority: createPriority,
        status: 'todo',
        title: createTitle.trim(),
      });
      setCreateTitle('');
      setCreateDescription('');
      setCreatePriority('medium');
      setShowCreateDialog(false);
      loadIssues();
    } catch {
      // Create failed
    } finally {
      setIsCreating(false);
    }
  }, [
    createTitle,
    createDescription,
    createPriority,
    isCreating,
    getIssuesService,
    loadIssues,
  ]);

  useEffect(() => {
    loadIssues();

    return () => {
      controllerRef.current?.abort();
    };
  }, [loadIssues]);

  const handleSelectIssue = useCallback((issue: Issue) => {
    setSelectedIssue(issue);
    openIssueOverlay();
  }, []);

  const handleOverlayClose = useCallback(() => {
    setSelectedIssue(null);
  }, []);

  const groupedByStatus = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = issues.filter((issue) => issue.status === status);
      return acc;
    },
    {} as Record<IssueStatus, Issue[]>,
  );

  return (
    <Container>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-white">Issues</h1>
        <div className="flex items-center gap-3">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            className="inline-flex items-center gap-1.5"
            onClick={() => setShowCreateDialog(true)}
          >
            <HiOutlinePlusCircle className="h-3.5 w-3.5" />
            New Issue
          </Button>
          <Select
            value={statusFilter || 'all'}
            onValueChange={(value) =>
              setStatusFilter(value === 'all' ? '' : (value as IssueStatus))
            }
          >
            <SelectTrigger className="w-auto text-xs">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex rounded border border-white/10">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'list'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60',
              )}
              onClick={() => setViewMode('list')}
            >
              <HiOutlineListBullet className="h-4 w-4" />
            </Button>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.ICON}
              className={cn(
                'p-1.5 transition-colors',
                viewMode === 'kanban'
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60',
              )}
              onClick={() => setViewMode('kanban')}
            >
              <HiOutlineViewColumns className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <LazyLoadingFallback variant="minimal" />
      ) : issues.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <HiOutlineExclamationTriangle className="mb-3 h-8 w-8 text-white/20" />
            <p className="text-sm text-white/50">No issues found</p>
            <p className="mt-1 text-xs text-white/30">
              Issues will appear here once created
            </p>
          </div>
        </Card>
      ) : viewMode === 'list' ? (
        <Card>
          <div className="flex items-center gap-4 border-b border-white/10 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            <span className="w-20 shrink-0">ID</span>
            <span className="flex-1">Title</span>
            <span className="w-16">Priority</span>
            <span className="w-20">Status</span>
            <span className="w-28 text-right">Updated</span>
          </div>
          {issues.map((issue) => (
            <IssueRow
              issue={issue}
              key={issue.id}
              onSelect={handleSelectIssue}
            />
          ))}
        </Card>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STATUS_ORDER.map((status) => (
            <KanbanColumn
              issues={groupedByStatus[status]}
              key={status}
              status={status}
              onSelect={handleSelectIssue}
            />
          ))}
        </div>
      )}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Create Issue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-white/50">
                Title
              </label>
              <Input
                type="text"
                placeholder="Issue title"
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/50">
                Description
              </label>
              <Textarea
                className="w-full rounded border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none placeholder:text-white/25 focus:border-white/20"
                placeholder="Optional description"
                rows={4}
                value={createDescription}
                onChange={(e) => setCreateDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-white/50">
                Priority
              </label>
              <Select
                value={createPriority}
                onValueChange={(value) =>
                  setCreatePriority(value as IssuePriority)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={() => setShowCreateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className={cn(isCreating && 'cursor-not-allowed opacity-50')}
              disabled={isCreating || !createTitle.trim()}
              onClick={handleCreateIssue}
            >
              {isCreating ? 'Creating...' : 'Create Issue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <IssueOverlay issue={selectedIssue} onClose={handleOverlayClose} />
    </Container>
  );
}
