'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import { Input } from '@ui/primitives/input';
import {
  Clock,
  Copy,
  MoreHorizontal,
  Plus,
  Search,
  Tag,
  Trash2,
  Workflow,
  X,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { WorkflowPreview } from '@/components/WorkflowPreview';

import type { WorkflowData } from '@/lib/api';
import { workflowsApi } from '@/lib/api';
import { useWorkflowStore } from '@/store/workflowStore';

function formatRelativeTime(date: Date): string {
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

interface WorkflowCardProps {
  workflow: WorkflowData;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}

function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
  const lowerUrl = url.toLowerCase();
  return videoExtensions.some((ext) => lowerUrl.includes(ext));
}

function WorkflowCard({ workflow, onDelete, onDuplicate }: WorkflowCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const hasThumbnail = Boolean(workflow.thumbnail);
  const isVideo = hasThumbnail && isVideoUrl(workflow.thumbnail!);

  return (
    <Link
      href={`/workflows/${workflow._id}`}
      className="group relative flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 hover:border-white transition-all duration-200"
    >
      {/* Workflow preview / Thumbnail */}
      <div className="relative aspect-video bg-[var(--secondary)] rounded-md mb-3 overflow-hidden">
        {hasThumbnail ? (
          isVideo ? (
            <video
              src={workflow.thumbnail!}
              className="h-full w-full object-cover object-center"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <Image
              src={workflow.thumbnail!}
              alt={workflow.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover object-center"
              unoptimized
            />
          )
        ) : (
          <WorkflowPreview
            nodes={workflow.nodes ?? []}
            edges={workflow.edges ?? []}
          />
        )}
      </div>

      {/* Info */}
      <h3 className="font-medium text-[var(--foreground)] truncate">
        {workflow.name}
      </h3>
      <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] mt-1">
        <Clock className="w-3 h-3" />
        <span>{formatRelativeTime(new Date(workflow.updatedAt))}</span>
        <span className="mx-1">·</span>
        <span>{workflow.nodes?.length ?? 0} nodes</span>
      </div>

      {/* Tags */}
      {workflow.tags && workflow.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {workflow.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)]"
            >
              <Tag className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
          {workflow.tags.length > 3 && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] text-[var(--muted-foreground)]">
              +{workflow.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Menu button */}
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className="absolute top-3 right-3 p-1.5 rounded-md bg-[var(--background)] border border-[var(--border)] opacity-0 group-hover:opacity-100 hover:bg-[var(--secondary)] transition"
        icon={
          <MoreHorizontal className="w-4 h-4 text-[var(--muted-foreground)]" />
        }
      />

      {/* Dropdown menu */}
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          <div className="absolute top-12 right-3 z-20 bg-[var(--card)] border border-[var(--border)] rounded-lg shadow-lg py-1 min-w-[140px]">
            <Button
              variant={ButtonVariant.GHOST}
              size={ButtonSize.SM}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDuplicate(workflow._id);
                setShowMenu(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--secondary)] transition rounded-none justify-start"
              icon={<Copy className="w-4 h-4" />}
            >
              Duplicate
            </Button>
            <Button
              variant={ButtonVariant.DESTRUCTIVE}
              size={ButtonSize.SM}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(workflow._id);
                setShowMenu(false);
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-[var(--secondary)] transition rounded-none justify-start"
              icon={<Trash2 className="w-4 h-4" />}
            >
              Delete
            </Button>
          </div>
        </>
      )}
    </Link>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const { deleteWorkflow, duplicateWorkflowApi } = useWorkflowStore();

  const [workflows, setWorkflows] = useState<WorkflowData[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const fetchWorkflows = useCallback(
    async (
      params?: { search?: string; tag?: string },
      signal?: AbortSignal,
    ) => {
      try {
        setIsLoading(true);
        const data = await workflowsApi.getAll(params, signal);
        data.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setWorkflows(data);
        setHasFetched(true);
      } catch (err) {
        if (signal?.aborted) return;
        setError(
          err instanceof Error ? err.message : 'Failed to load workflows',
        );
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const fetchTags = useCallback(async (signal?: AbortSignal) => {
    try {
      const tags = await workflowsApi.getAllTags(signal);
      setAllTags(tags);
    } catch {
      // Tags are non-critical, silently fail
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchWorkflows(undefined, controller.signal);
    fetchTags(controller.signal);
    return () => controller.abort();
  }, [fetchWorkflows, fetchTags]);

  // Refetch when filters change
  useEffect(() => {
    const controller = new AbortController();
    const params: { search?: string; tag?: string } = {};
    if (searchQuery) params.search = searchQuery;
    if (selectedTag) params.tag = selectedTag;
    fetchWorkflows(params, controller.signal);
    return () => controller.abort();
  }, [searchQuery, selectedTag, fetchWorkflows]);

  const handleSearchChange = useCallback((value: string) => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
    }, 300);
  }, []);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm('Are you sure you want to delete this workflow?')) return;
      try {
        await deleteWorkflow(id);
        setWorkflows((prev) => prev.filter((w) => w._id !== id));
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Failed to delete workflow');
      }
    },
    [deleteWorkflow],
  );

  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const duplicated = await duplicateWorkflowApi(id);
        router.push(`/workflows/${duplicated._id}`);
      } catch (err) {
        alert(
          err instanceof Error ? err.message : 'Failed to duplicate workflow',
        );
      }
    },
    [duplicateWorkflowApi, router],
  );

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--foreground)]">
              Your Workflows
            </h2>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
              <Input
                type="text"
                placeholder="Search workflows..."
                onChange={(e) => handleSearchChange(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[var(--secondary)] border border-[var(--border)] rounded-lg text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-white/20"
              />
            </div>

            {/* Tag filters */}
            {allTags.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {selectedTag && (
                  <Button
                    variant={ButtonVariant.DEFAULT}
                    size={ButtonSize.XS}
                    onClick={() => setSelectedTag(null)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full font-medium"
                    icon={<Tag className="w-3 h-3" />}
                  >
                    {selectedTag}
                    <X className="w-3 h-3" />
                  </Button>
                )}
                {allTags
                  .filter((t) => t !== selectedTag)
                  .slice(0, 8)
                  .map((tag) => (
                    <Button
                      key={tag}
                      variant={ButtonVariant.GHOST}
                      size={ButtonSize.XS}
                      onClick={() => setSelectedTag(tag)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-[var(--secondary)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]/80 hover:text-[var(--foreground)]"
                      icon={<Tag className="w-3 h-3" />}
                    >
                      {tag}
                    </Button>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-[var(--muted-foreground)]">
              Loading workflows...
            </p>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="text-center py-20">
            <p className="text-red-500 mb-4">{error}</p>
            <Button
              variant={ButtonVariant.SECONDARY}
              onClick={() => fetchWorkflows()}
              className="px-4 py-2 rounded-lg"
            >
              Try Again
            </Button>
          </div>
        )}

        {/* Empty state */}
        {!isLoading && !error && hasFetched && workflows.length === 0 && (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--secondary)] flex items-center justify-center">
              <Workflow className="w-8 h-8 text-[var(--muted-foreground)]" />
            </div>
            <h3 className="text-lg font-medium text-[var(--foreground)] mb-2">
              No workflows yet
            </h3>
            <p className="text-[var(--muted-foreground)] mb-6">
              Create your first AI content workflow to get started
            </p>
            <Link
              href="/workflows/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 transition"
            >
              <Plus className="w-4 h-4" />
              Create Workflow
            </Link>
          </div>
        )}

        {/* Workflow grid */}
        {!isLoading && !error && workflows.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 [&:hover>*]:opacity-60 [&:hover>*:hover]:opacity-100">
            {/* New workflow card */}
            <Link
              href="/workflows/new"
              className="group flex items-center justify-center bg-[var(--card)] border-2 border-dashed border-[var(--border)] rounded-lg p-4 hover:border-white hover:bg-[var(--secondary)] transition-all duration-200"
            >
              <div className="flex flex-col items-center gap-3 py-8">
                <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 group-hover:scale-110 transition-all duration-300">
                  <Plus className="w-7 h-7 text-white" />
                </div>
                <span className="text-sm font-medium text-[var(--foreground)]">
                  New Workflow
                </span>
              </div>
            </Link>

            {/* Existing workflows */}
            {workflows.map((workflow) => (
              <WorkflowCard
                key={workflow._id}
                workflow={workflow}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
