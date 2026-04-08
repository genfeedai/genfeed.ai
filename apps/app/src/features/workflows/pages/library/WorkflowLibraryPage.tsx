'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { Cloud, CloudUpload } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineBolt,
  HiOutlineDocumentDuplicate,
  HiOutlineEllipsisVertical,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
  HiOutlineSparkles,
  HiOutlineTrash,
} from 'react-icons/hi2';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { getLifecycleBadgeClass } from '@/features/workflows/utils/status-helpers';
import { useCloudSession } from '@/hooks/useCloudSession';

const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_WORKFLOW_CARD_CDN =
  process.env.NEXT_PUBLIC_CDN_URL || 'https://cdn.genfeed.ai';
const DEFAULT_WORKFLOW_CARD_IMAGE = `${DEFAULT_WORKFLOW_CARD_CDN}${metadata.cards.default}`;

function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some((ext) => lowerUrl.includes(ext));
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// WorkflowCardPreview
// ---------------------------------------------------------------------------

function WorkflowCardPreview({
  name,
  thumbnail,
}: {
  name: string;
  thumbnail?: string | null;
}) {
  const [hasAssetError, setHasAssetError] = useState(false);
  const previewUrl = useMemo(() => {
    if (!thumbnail || hasAssetError) {
      return DEFAULT_WORKFLOW_CARD_IMAGE;
    }
    return thumbnail;
  }, [hasAssetError, thumbnail]);

  const isVideoPreview =
    previewUrl !== DEFAULT_WORKFLOW_CARD_IMAGE && isVideoUrl(previewUrl);

  return (
    <div className="relative aspect-video overflow-hidden rounded border border-white/5 bg-background/40">
      {isVideoPreview ? (
        <video
          src={previewUrl}
          className="h-full w-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          onError={() => setHasAssetError(true)}
        />
      ) : (
        <img
          src={previewUrl}
          alt={
            previewUrl === DEFAULT_WORKFLOW_CARD_IMAGE
              ? 'Default workflow card'
              : `${name} thumbnail`
          }
          className="h-full w-full object-cover object-center"
          onError={() => setHasAssetError(true)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowCardDropdown
// ---------------------------------------------------------------------------

function WorkflowCardDropdown({
  onDuplicate,
  onDelete,
}: {
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div ref={dropdownRef} className="relative">
      <Button
        type="button"
        variant={ButtonVariant.UNSTYLED}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="rounded p-1 text-foreground/40 transition-colors hover:bg-white/[0.06] hover:text-foreground"
      >
        <HiOutlineEllipsisVertical className="size-4" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-7 z-20 min-w-[140px] rounded-lg border border-white/10 bg-card py-1 shadow-lg">
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDuplicate();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground transition-colors hover:bg-white/[0.06]"
          >
            <HiOutlineDocumentDuplicate className="size-4" />
            Duplicate
          </Button>
          <Button
            type="button"
            variant={ButtonVariant.UNSTYLED}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
              setIsOpen(false);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-400 transition-colors hover:bg-white/[0.06]"
          >
            <HiOutlineTrash className="size-4" />
            Delete
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyWorkflowState
// ---------------------------------------------------------------------------

function EmptyWorkflowState() {
  const { href } = useOrgUrl();

  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-white/10 bg-card/40 px-6 py-16 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-foreground/5 text-foreground/30">
        <HiOutlineSparkles className="size-8" />
      </span>
      <div>
        <p className="text-lg font-medium">No workflows yet</p>
        <p className="mt-1 text-sm text-foreground/50">
          Create your first workflow for a fixed, repeatable automation
          pipeline.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href={href('/workflows/templates')}>
          <Button
            label="Browse Templates"
            variant={ButtonVariant.SECONDARY}
            icon={<HiOutlineDocumentDuplicate className="size-4" />}
          />
        </Link>
        <Link href={href('/workflows/new')}>
          <Button
            label="Create Workflow"
            variant={ButtonVariant.DEFAULT}
            icon={<HiOutlinePlus className="size-4" />}
          />
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WorkflowLibraryPage
// ---------------------------------------------------------------------------

/**
 * Workflow Library - List of saved workflows with search, cards, and actions
 */
export default function WorkflowLibraryPage() {
  const { href } = useOrgUrl();
  const router = useRouter();
  const { isConnected, isCapable } = useCloudSession();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const getService = useAuthedService(createWorkflowApiService);

  // Debounced search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchInput]);

  // Load workflows
  const loadWorkflows = useCallback(
    async (signal: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const service = await getService();
        if (signal.aborted) return;

        const params: Record<string, unknown> = {};
        if (debouncedSearch) params.search = debouncedSearch;

        const data = await service.list(params);
        if (signal.aborted) return;

        setWorkflows(data);
      } catch (err) {
        if (signal.aborted) return;
        const message =
          err instanceof Error ? err.message : 'Failed to load workflows';
        logger.error('Failed to load workflows', { error: err });
        setError(message);
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [getService, debouncedSearch],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadWorkflows(controller.signal);
    return () => controller.abort();
  }, [loadWorkflows]);

  // Actions
  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const service = await getService();
        const duplicated = await service.duplicate(id);
        router.push(href(`/workflows/${duplicated._id}`));
      } catch (err) {
        logger.error('Failed to duplicate workflow', {
          error: err,
          workflowId: id,
        });
      }
    },
    [getService, router, href],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      try {
        const service = await getService();
        await service.remove(id);
        setWorkflows((prev) => prev.filter((w) => w._id !== id));
      } catch (err) {
        logger.error('Failed to delete workflow', {
          error: err,
          workflowId: id,
        });
      }
    },
    [getService],
  );

  // Filter client-side for instant feedback during debounce
  const filteredWorkflows = useMemo(() => {
    if (!searchInput || searchInput === debouncedSearch) return workflows;
    const query = searchInput.toLowerCase();
    return workflows.filter(
      (w) =>
        w.name.toLowerCase().includes(query) ||
        w.description?.toLowerCase().includes(query),
    );
  }, [workflows, searchInput, debouncedSearch]);

  // Loading skeleton
  if (isLoading && workflows.length === 0) {
    return (
      <Container
        label="Workflows"
        description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
        icon={HiOutlineBolt}
        right={
          <>
            <div className="h-10 w-28 animate-pulse rounded bg-muted" />
            <div className="h-10 w-36 animate-pulse rounded bg-muted" />
          </>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {['sk-1', 'sk-2', 'sk-3', 'sk-4', 'sk-5', 'sk-6'].map(
            (skeletonId) => (
              <div
                key={skeletonId}
                className="h-64 animate-pulse rounded-lg border border-white/[0.06] bg-card"
              />
            ),
          )}
        </div>
      </Container>
    );
  }

  // Error state
  if (error) {
    return (
      <Container
        label="Workflows"
        description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
        icon={HiOutlineBolt}
      >
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 px-6 text-center">
          <p className="text-destructive">{error}</p>
          <Button
            label="Retry"
            variant={ButtonVariant.OUTLINE}
            onClick={() => {
              const controller = new AbortController();
              loadWorkflows(controller.signal);
            }}
          />
        </div>
      </Container>
    );
  }

  return (
    <Container
      label="Workflows"
      description="Use workflows for fixed, reusable automation graphs and scheduled pipelines."
      icon={HiOutlineBolt}
      right={
        <>
          <Link href={href('/workflows/templates')}>
            <Button
              label="Templates"
              variant={ButtonVariant.SECONDARY}
              icon={<HiOutlineDocumentDuplicate className="size-4" />}
            />
          </Link>
          <Link href={href('/workflows/new')}>
            <Button
              label="New Workflow"
              variant={ButtonVariant.DEFAULT}
              icon={<HiOutlinePlus className="size-4" />}
            />
          </Link>
        </>
      }
    >
      {/* Search bar */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <HiOutlineMagnifyingGlass className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            placeholder="Search workflows..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/[0.03] py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-white/20 focus:outline-none"
          />
        </div>
        {isLoading && workflows.length > 0 && (
          <div className="size-4 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground/60" />
        )}
      </div>

      {/* Contextual info */}
      <div className="mb-4 rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-foreground/70">
        <span className="font-medium text-foreground">Workflows</span> are
        explicit automation graphs. Schedule a workflow when the steps should be
        predictable and repeatable. For adaptive agent behavior, use{' '}
        <Link
          href={href('/orchestration/autopilot')}
          className="underline underline-offset-2"
        >
          Autopilot
        </Link>
        .
      </div>

      {filteredWorkflows.length === 0 && !searchInput ? (
        <EmptyWorkflowState />
      ) : filteredWorkflows.length === 0 && searchInput ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm text-foreground/50">
            No workflows matching &ldquo;{searchInput}&rdquo;
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {/* New Workflow card */}
          <Link
            href={href('/workflows/new')}
            className="group flex items-center justify-center rounded-lg border-2 border-dashed border-white/10 bg-card/40 p-4 transition-all duration-200 hover:border-white/20 hover:bg-card/60"
          >
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="flex size-14 items-center justify-center rounded-full bg-foreground/5 transition-all duration-300 group-hover:scale-110 group-hover:bg-foreground/10">
                <HiOutlinePlus className="size-7 text-foreground/50" />
              </div>
              <span className="text-sm font-medium text-foreground/70">
                New Workflow
              </span>
            </div>
          </Link>

          {/* Workflow cards */}
          {filteredWorkflows.map((workflow) => (
            <Link key={workflow._id} href={href(`/workflows/${workflow._id}`)}>
              <Card
                className="h-full hover:-translate-y-0.5"
                label={workflow.name}
                description={
                  workflow.description ??
                  'Reusable automation workflow for content operations.'
                }
                headerAction={
                  <div className="flex items-center gap-2">
                    {isCapable && isConnected && workflow.cloudSync ? (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400">
                        <Cloud className="h-3 w-3" />
                        synced
                      </span>
                    ) : isCapable && isConnected && !workflow.cloudSync ? (
                      <span className="flex items-center gap-1 rounded-full bg-white/[0.06] px-2 py-0.5 text-xs text-muted-foreground">
                        <CloudUpload className="h-3 w-3" />
                        local
                      </span>
                    ) : null}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${getLifecycleBadgeClass(
                        workflow.lifecycle,
                      )}`}
                    >
                      {workflow.lifecycle}
                    </span>
                    <WorkflowCardDropdown
                      onDuplicate={() => handleDuplicate(workflow._id)}
                      onDelete={() => handleDelete(workflow._id)}
                    />
                  </div>
                }
                bodyClassName="h-full justify-between"
              >
                <div className="space-y-3">
                  <WorkflowCardPreview
                    name={workflow.name}
                    thumbnail={workflow.thumbnail}
                  />
                  <div className="flex items-center justify-between text-xs text-foreground/50">
                    <span>
                      Updated {formatRelativeTime(workflow.updatedAt)}
                    </span>
                    <span>
                      Created{' '}
                      {new Date(workflow.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
