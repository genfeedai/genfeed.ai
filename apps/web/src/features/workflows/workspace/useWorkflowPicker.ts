'use client';

import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { logger } from '@services/core/logger.service';
import { type SetStateAction, useCallback, useMemo, useState } from 'react';
import {
  createWorkflowApiService,
  type WorkflowSummary,
} from '@/features/workflows/services/workflow-api';

const WORKFLOW_PICKER_PAGE_SIZE = 12;
const WORKFLOW_PICKER_SORT = 'updatedAt: -1';
const EMPTY_WORKFLOWS: WorkflowSummary[] = [];

interface UseWorkflowPickerOptions {
  readonly activeBrandId?: string | null;
}

/**
 * One server page of the brand's authorized workflows, searched on the page.
 *
 * Cached per brand and page, so reopening the picker paints the last list at
 * once and refreshes it in the background. Another brand never sees it, and a
 * brand change starts again at page 1. A failed background refresh keeps the
 * list on screen; the error only replaces it when there is nothing to show.
 */
export function useWorkflowPicker({ activeBrandId }: UseWorkflowPickerOptions) {
  const brandId = activeBrandId ?? null;
  const [pageState, setPageState] = useState({ brandId, page: 1 });
  const page = pageState.brandId === brandId ? pageState.page : 1;
  const setPage = useCallback(
    (next: SetStateAction<number>) => {
      setPageState((current) => {
        const currentPage = current.brandId === brandId ? current.page : 1;
        return {
          brandId,
          page: typeof next === 'function' ? next(currentPage) : next,
        };
      });
    },
    [brandId],
  );
  const [search, setSearch] = useState('');

  const workflowsQuery = useAuthedQuery({
    enabled: Boolean(brandId),
    queryFn: async (service) => {
      if (!brandId) {
        throw new Error('workflow_picker_brand_required');
      }
      try {
        return await service.list({
          brandId,
          limit: WORKFLOW_PICKER_PAGE_SIZE,
          page,
          sort: WORKFLOW_PICKER_SORT,
        });
      } catch (cause) {
        logger.error('Failed to load workflow picker', { cause, page });
        throw cause;
      }
    },
    queryKey: [
      'workflow-picker',
      brandId,
      { limit: WORKFLOW_PICKER_PAGE_SIZE, page, sort: WORKFLOW_PICKER_SORT },
    ],
    service: createWorkflowApiService,
  });
  const workflows =
    brandId && workflowsQuery.data ? workflowsQuery.data : EMPTY_WORKFLOWS;
  // A retry after a failed first read shows the spinner again; a background
  // refresh behind cached rows does not.
  const isLoading =
    Boolean(brandId) &&
    !workflowsQuery.data &&
    (workflowsQuery.isPending || workflowsQuery.isFetching);
  const loadError = workflowsQuery.error;
  const error =
    brandId && loadError && !workflowsQuery.data
      ? loadError.message || 'Failed to load authorized workflows'
      : null;

  const visibleWorkflows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return workflows.filter((workflow) => {
      if (brandId && workflow.brandId !== brandId) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return `${workflow.label} ${workflow.description ?? ''}`
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [brandId, search, workflows]);

  const { refetch } = workflowsQuery;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

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
