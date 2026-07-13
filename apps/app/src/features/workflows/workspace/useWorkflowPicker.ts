'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { logger } from '@services/core/logger.service';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';

const WORKFLOW_PICKER_PAGE_SIZE = 12;

interface UseWorkflowPickerOptions {
  readonly activeBrandId?: string | null;
}

export function useWorkflowPicker({ activeBrandId }: UseWorkflowPickerOptions) {
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const getService = useAuthedService(createWorkflowApiService);

  useEffect(() => {
    void reloadKey;
    if (!activeBrandId) {
      setError(null);
      setIsLoading(false);
      setWorkflows([]);
      return;
    }

    const controller = new AbortController();

    const load = async (): Promise<void> => {
      setIsLoading(true);
      setError(null);

      try {
        const service = await getService();
        if (controller.signal.aborted) {
          return;
        }

        const data = await service.list({
          brandId: activeBrandId,
          limit: WORKFLOW_PICKER_PAGE_SIZE,
          page,
          sort: 'updatedAt: -1',
        });
        if (!controller.signal.aborted) {
          setWorkflows(data);
        }
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('Failed to load workflow picker', { cause, page });
        setError(
          cause instanceof Error
            ? cause.message
            : 'Failed to load authorized workflows',
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [activeBrandId, getService, page, reloadKey]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: brand changes must reset server pagination before the next request.
  useEffect(() => {
    setPage(1);
  }, [activeBrandId]);

  const visibleWorkflows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return workflows.filter((workflow) => {
      if (activeBrandId && workflow.brandId !== activeBrandId) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return `${workflow.name} ${workflow.description ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [activeBrandId, search, workflows]);

  const retry = useCallback(() => {
    setReloadKey((current) => current + 1);
  }, []);

  return {
    error,
    hasNextPage: workflows.length === WORKFLOW_PICKER_PAGE_SIZE,
    isLoading,
    page,
    retry,
    search,
    setPage,
    setSearch,
    visibleWorkflows,
  };
}
