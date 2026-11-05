import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IPaginationParams } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  toBrandListParams,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type CloudWorkflowData,
  createWorkflowApiService,
  isCanonicalSystemWorkflow,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { useCloudSession } from '@/hooks/useCloudSession';

export const WORKFLOW_LIBRARY_PAGE_SIZE = ITEMS_PER_PAGE;

interface WorkflowLibraryPageData {
  items: WorkflowSummary[];
  pagination: IPaginationParams;
}

const EMPTY_WORKFLOWS: WorkflowSummary[] = [];
const FIRST_PAGE_PAGINATION: IPaginationParams = {
  limit: WORKFLOW_LIBRARY_PAGE_SIZE,
  page: 1,
  pages: 1,
  total: 0,
};

interface WorkflowLibraryOptions {
  relatedWorkflows?: WorkflowSummary[];
  onWorkflowUpdated?: (id: string, update: Partial<WorkflowSummary>) => void;
  onWorkflowRemoved?: (id: string) => void;
}

export function useWorkflowLibraryPage({
  relatedWorkflows = [],
  onWorkflowUpdated,
  onWorkflowRemoved,
}: WorkflowLibraryOptions = {}) {
  const { href } = useOrgUrl();
  const { push } = useRouter();
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const { isConnected, isCapable } = useCloudSession();
  const notificationsService = NotificationsService.getInstance();
  const [searchInput, setSearchInput] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // The page belongs to the scope it was picked in: a new organization,
  // brand, scope or search starts on page 1 without a request for the old
  // page number first.
  const scopeKey = `${organizationId}:${pageScope}:${brandId ?? ''}:${searchInput}`;
  const [pageState, setPageState] = useState({ page: 1, scopeKey });
  const page = pageState.scopeKey === scopeKey ? pageState.page : 1;
  const setPage = useCallback(
    (nextPage: number) => {
      setPageState({ page: nextPage, scopeKey });
    },
    [scopeKey],
  );

  const getService = useAuthedService(createWorkflowApiService);
  const queryClient = useQueryClient();

  const isScopeLoadable =
    isReady && Boolean(organizationId) && (pageScope !== 'brand' || !!brandId);
  const scopeQueryKey = useMemo<QueryKey>(
    () => ['workflow-library', organizationId, pageScope, brandId ?? null],
    [brandId, organizationId, pageScope],
  );
  const pageQueryKey = useMemo<QueryKey>(
    () => [...scopeQueryKey, { page, search: searchInput }],
    [page, scopeQueryKey, searchInput],
  );

  const workflowsQuery = useAuthedQuery({
    enabled: isScopeLoadable,
    // A new page or search keeps the current rows on screen until it lands.
    keepPreviousDataWithin: scopeQueryKey,
    queryFn: async (service: ReturnType<typeof createWorkflowApiService>) => {
      const params: Record<string, unknown> = {
        ...toBrandListParams({ brandId }),
        limit: WORKFLOW_LIBRARY_PAGE_SIZE,
        page,
      };
      if (searchInput) params.search = searchInput;

      try {
        return await service.listPage(params);
      } catch (err) {
        logger.error('Failed to load workflows', { error: err });
        throw err;
      }
    },
    queryKey: pageQueryKey,
    service: createWorkflowApiService,
  });
  const workflows = workflowsQuery.data?.items ?? EMPTY_WORKFLOWS;
  const pagination = workflowsQuery.data?.pagination ?? FIRST_PAGE_PAGINATION;
  const isLoading = workflowsQuery.isPending;
  const error = workflowsQuery.error
    ? workflowsQuery.error.message || 'Failed to load workflows'
    : null;
  const { refetch } = workflowsQuery;

  const loadWorkflows = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const setWorkflows = useCallback(
    (update: (current: WorkflowSummary[]) => WorkflowSummary[]) => {
      queryClient.setQueriesData<WorkflowLibraryPageData>(
        { queryKey: scopeQueryKey },
        (current) =>
          current ? { ...current, items: update(current.items) } : current,
      );
    },
    [queryClient, scopeQueryKey],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: org, brand, search, and scope changes must reset bulk selection before the next request.
  useEffect(() => {
    setSelectedIds((current) => (current.size === 0 ? current : new Set()));
  }, [brandId, organizationId, pageScope, searchInput]);

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
        notificationsService.error(
          err instanceof Error ? err.message : 'Could not duplicate workflow',
        );
      }
    },
    [getService, notificationsService, push, href],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const workflow = [...workflows, ...relatedWorkflows].find(
        (w) => w.id === id,
      );
      if (workflow && isCanonicalSystemWorkflow(workflow)) {
        return;
      }

      try {
        const service = await getService();
        await service.remove(id);
        onWorkflowRemoved?.(id);
        setWorkflows((prev) => prev.filter((w) => w.id !== id));
      } catch (err) {
        logger.error('Failed to delete workflow', {
          error: err,
          workflowId: id,
        });
      }
    },
    [getService, workflows, relatedWorkflows, onWorkflowRemoved],
  );

  const handleToggleSchedule = useCallback(
    async (id: string, enabled: boolean) => {
      const previous = [...workflows, ...relatedWorkflows].find(
        (w) => w.id === id,
      );
      if (!previous?.schedule) return;

      onWorkflowUpdated?.(id, { isScheduleEnabled: enabled });
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
        onWorkflowUpdated?.(id, { nextRunAt: updated.nextRunAt ?? null });
        setWorkflows((prev) =>
          prev.map((w) =>
            w.id === id ? { ...w, nextRunAt: updated.nextRunAt ?? null } : w,
          ),
        );
      } catch (err) {
        onWorkflowUpdated?.(id, {
          isScheduleEnabled: previous.isScheduleEnabled,
        });
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
    [
      getService,
      notificationsService,
      workflows,
      relatedWorkflows,
      onWorkflowUpdated,
    ],
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
    const selectedWorkflows = [
      ...new Map(
        [...workflows, ...relatedWorkflows].map((item) => [item.id, item]),
      ).values(),
    ].filter((item) => selectedIds.has(item.id));
    for (const workflow of selectedWorkflows) {
      if (workflow.schedule && workflow.isScheduleEnabled) {
        await handleToggleSchedule(workflow.id, false);
      }
    }
    setSelectedIds(new Set());
  }, [handleToggleSchedule, selectedIds, workflows, relatedWorkflows]);

  /** Merge a schedule mutation result back into the loaded summaries. */
  const applyScheduleUpdate = useCallback(
    (
      updated: Pick<
        CloudWorkflowData,
        'id' | 'isScheduleEnabled' | 'nextRunAt' | 'schedule' | 'timezone'
      >,
    ) => {
      onWorkflowUpdated?.(updated.id, {
        ...updated,
        isScheduleEnabled: updated.isScheduleEnabled ?? false,
        nextRunAt: updated.nextRunAt ?? null,
      });
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
    [onWorkflowUpdated],
  );

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
    selectedIds,
    toggleSelected,
    clearSelection,
    page,
    pagination,
    setPage,
  };
}
