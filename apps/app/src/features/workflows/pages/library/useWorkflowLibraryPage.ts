import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/constants';
import type { IPaginationParams } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CloudWorkflowData,
  createWorkflowApiService,
  isCanonicalSystemWorkflow,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { useCloudSession } from '@/hooks/useCloudSession';

const SEARCH_DEBOUNCE_MS = 300;
export const WORKFLOW_LIBRARY_PAGE_SIZE = ITEMS_PER_PAGE;

export function useWorkflowLibraryPage() {
  const { href } = useOrgUrl();
  const { push } = useRouter();
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const { isConnected, isCapable } = useCloudSession();
  const notificationsService = NotificationsService.getInstance();
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<IPaginationParams>({
    limit: WORKFLOW_LIBRARY_PAGE_SIZE,
    page: 1,
    pages: 1,
    total: 0,
  });
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const loadedScopeKeyRef = useRef<string | null>(null);

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

        const scopeKey = `${organizationId}:${pageScope}:${brandId ?? ''}:${debouncedSearch}`;
        const requestPage = loadedScopeKeyRef.current === scopeKey ? page : 1;
        if (loadedScopeKeyRef.current !== scopeKey && page !== 1) {
          setPage(1);
        }
        loadedScopeKeyRef.current = scopeKey;

        const params: Record<string, unknown> = {
          ...toBrandListParams({ brandId }),
          limit: WORKFLOW_LIBRARY_PAGE_SIZE,
          page: requestPage,
        };
        if (debouncedSearch) params.search = debouncedSearch;

        const data = await service.listPage(params);
        if (signal.aborted) return;

        setWorkflows(data.items);
        setPagination(data.pagination);
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
    [brandId, debouncedSearch, getService, organizationId, page, pageScope],
  );

  useEffect(() => {
    if (!isReady || !organizationId) {
      return;
    }
    if (pageScope === 'brand' && !brandId) {
      return;
    }

    const controller = new AbortController();
    loadWorkflows(controller.signal);
    return () => controller.abort();
  }, [brandId, isReady, loadWorkflows, organizationId, pageScope]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: org, brand, search, and scope changes must reset pagination and bulk selection before the next request.
  useEffect(() => {
    setPage((current) => (current === 1 ? current : 1));
    setSelectedIds((current) => (current.size === 0 ? current : new Set()));
  }, [brandId, debouncedSearch, organizationId, pageScope]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: page changes must drop selected IDs that are no longer in the current query.
  useEffect(() => {
    setSelectedIds((current) => (current.size === 0 ? current : new Set()));
  }, [page]);

  // Actions
  const handleDuplicate = useCallback(
    async (id: string) => {
      try {
        const service = await getService();
        const duplicated = await service.duplicate(id);
        push(href(`${APP_ROUTES.AUTOMATION.WORKFLOWS}/${duplicated.id}`));
      } catch (err) {
        logger.error('Failed to duplicate workflow', {
          error: err,
          workflowId: id,
        });
      }
    },
    [getService, push, href],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const workflow = workflows.find((w) => w.id === id);
      if (workflow && isCanonicalSystemWorkflow(workflow)) {
        return;
      }

      try {
        const service = await getService();
        await service.remove(id);
        setWorkflows((prev) => prev.filter((w) => w.id !== id));
      } catch (err) {
        logger.error('Failed to delete workflow', {
          error: err,
          workflowId: id,
        });
      }
    },
    [getService, workflows],
  );

  const handleToggleSchedule = useCallback(
    async (id: string, enabled: boolean) => {
      const previous = workflows.find((w) => w.id === id);
      if (!previous?.schedule) return;

      // Optimistic update
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === id ? { ...w, isScheduleEnabled: enabled } : w,
        ),
      );

      try {
        const service = await getService();
        const updated = await service.updateSchedule(id, {
          isScheduleEnabled: enabled,
          schedule: previous.schedule,
          timezone: previous.timezone,
        });
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id ? { ...w, nextRunAt: updated.nextRunAt ?? null } : w,
          ),
        );
      } catch (err) {
        // Revert on error
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id
              ? { ...w, isScheduleEnabled: previous.isScheduleEnabled }
              : w,
          ),
        );
        logger.error('Failed to toggle workflow schedule', {
          error: err,
          workflowId: id,
        });
        notificationsService.error(
          err instanceof Error
            ? err.message
            : 'Could not update workflow schedule',
        );
      }
    },
    [getService, notificationsService, workflows],
  );

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleDisableSelected = useCallback(async () => {
    const selectedWorkflows = workflows.filter((item) =>
      selectedIds.has(item.id),
    );
    for (const workflow of selectedWorkflows) {
      if (workflow.schedule && workflow.isScheduleEnabled) {
        await handleToggleSchedule(workflow.id, false);
      }
    }
    setSelectedIds(new Set());
  }, [handleToggleSchedule, selectedIds, workflows]);

  /** Merge a schedule mutation result back into the loaded summaries. */
  const applyScheduleUpdate = useCallback(
    (
      updated: Pick<
        CloudWorkflowData,
        'id' | 'isScheduleEnabled' | 'nextRunAt' | 'schedule' | 'timezone'
      >,
    ) => {
      setWorkflows((prev) =>
        prev.map((w) =>
          w.id === updated.id
            ? {
                ...w,
                isScheduleEnabled: updated.isScheduleEnabled ?? false,
                nextRunAt: updated.nextRunAt ?? null,
                schedule: updated.schedule,
                timezone: updated.timezone,
              }
            : w,
        ),
      );
    },
    [],
  );

  // Filter client-side for instant feedback during debounce
  const filteredWorkflows = useMemo(() => {
    if (!searchInput || searchInput === debouncedSearch) return workflows;
    const query = searchInput.toLowerCase();
    return workflows.filter(
      (w) =>
        w.label.toLowerCase().includes(query) ||
        w.description?.toLowerCase().includes(query),
    );
  }, [workflows, searchInput, debouncedSearch]);

  return {
    href,
    isConnected,
    isCapable,
    workflows,
    isLoading,
    error,
    searchInput,
    setSearchInput,
    loadWorkflows,
    handleDuplicate,
    handleDelete,
    handleToggleSchedule,
    handleDisableSelected,
    applyScheduleUpdate,
    filteredWorkflows,
    selectedIds,
    toggleSelected,
    clearSelection,
    page,
    pagination,
    setPage,
  };
}
