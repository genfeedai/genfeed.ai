import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { logger } from '@services/core/logger.service';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';
import { useCloudSession } from '@/hooks/useCloudSession';

const SEARCH_DEBOUNCE_MS = 300;

export function useWorkflowLibraryPage() {
  const { href } = useOrgUrl();
  const { push } = useRouter();
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
        push(href(`/workflows/${duplicated._id}`));
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
    filteredWorkflows,
  };
}
