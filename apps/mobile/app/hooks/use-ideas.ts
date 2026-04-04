import { useCallback } from 'react';
import {
  useAsyncAction,
  useAsyncItem,
  useAsyncList,
} from '@/hooks/use-async-data';
import {
  type CreateIdeaPayload,
  type Idea,
  type IdeasQueryOptions,
  ideasService,
  type UpdateIdeaPayload,
} from '@/services/api/ideas.service';

export type { CreateIdeaPayload, Idea, IdeasQueryOptions, UpdateIdeaPayload };

export function useIdeas(options: IdeasQueryOptions = {}) {
  const result = useAsyncList<Idea, IdeasQueryOptions>(
    (token, opts) => ideasService.findAll(token, opts),
    'ideas',
    { options },
  );

  return {
    error: result.error,
    ideas: result.data,
    isLoading: result.isLoading,
    isRefreshing: result.isRefreshing,
    pagination: result.pagination,
    refetch: result.refetch,
    refresh: result.refresh,
  };
}

export function useIdea(id: string | null) {
  const result = useAsyncItem<Idea>(
    (token, itemId) => ideasService.findOne(token, itemId),
    id,
    'idea',
  );

  return {
    error: result.error,
    idea: result.data,
    isLoading: result.isLoading,
    refetch: result.refetch,
  };
}

export function useIdeaActions() {
  const { execute, isSubmitting, error, clearError } = useAsyncAction();

  const create = useCallback(
    async (payload: CreateIdeaPayload): Promise<Idea | null> => {
      const result = await execute(
        (token) => ideasService.create(token, payload),
        'Failed to create idea',
      );
      return result?.data || null;
    },
    [execute],
  );

  const update = useCallback(
    async (id: string, payload: UpdateIdeaPayload): Promise<Idea | null> => {
      const result = await execute(
        (token) => ideasService.update(token, id, payload),
        'Failed to update idea',
      );
      return result?.data || null;
    },
    [execute],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const result = await execute(
        (token) => ideasService.delete(token, id),
        'Failed to delete idea',
      );
      return result !== null;
    },
    [execute],
  );

  return {
    clearError,
    create,
    error,
    isSubmitting,
    remove,
    update,
  };
}
