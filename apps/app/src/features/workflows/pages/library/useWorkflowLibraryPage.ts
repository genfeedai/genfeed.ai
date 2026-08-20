import { APP_ROUTES } from '@genfeedai/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
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

export function useWorkflowLibraryPage() {
  const { href } = useOrgUrl();
  const { push } = useRouter();
  const { isConnected, isCapable } = useCloudSession();
  const notificationsService = NotificationsService.getInstance();
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
        push(href(`${APP_ROUTES.AUTOMATE.WORKFLOWS}/${duplicated.id}`));
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
      if (!previous?.schedule || isCanonicalSystemWorkflow(previous)) return;

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
    applyScheduleUpdate,
    filteredWorkflows,
  };
}
