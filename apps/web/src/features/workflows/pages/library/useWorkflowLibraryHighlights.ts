'use client';

import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { NotificationsService } from '@services/core/notifications.service';
import type { UsersService } from '@services/organization/users.service';
import { type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';
import { createUsersService } from '@/components/shell/me-settings-query';
import {
  createWorkflowApiService,
  type WorkflowApiService,
  type WorkflowSummary,
  type WorkflowUsageSummary,
} from '@/features/workflows/services/workflow-api';

interface HighlightState<T> {
  items: T[];
  isLoading: boolean;
  hasError: boolean;
}

interface FavoritesData {
  ids: string[];
  items: WorkflowSummary[];
}

const NO_IDS: string[] = [];

/** The saved ids were read but their workflows could not be. */
class FavoriteWorkflowsReadError extends Error {
  constructor(readonly favoriteIds: string[]) {
    super('Favorite workflows could not be read');
    this.name = 'FavoriteWorkflowsReadError';
  }
}

function highlightState<T>(
  data: T[] | undefined,
  isPending: boolean,
  isFetching: boolean,
  isError: boolean,
): HighlightState<T> {
  // A failed background refresh keeps the loaded rows and reports nothing.
  const hasData = data !== undefined;
  return {
    hasError: !hasData && isError && !isFetching,
    isLoading: !hasData && (isPending || isFetching),
    items: data ?? [],
  };
}

/**
 * Favorites and org usage settle independently of the paginated library. Both
 * are cached per scope (and viewer), so returning to the library paints them
 * at once and refreshes them in the background; a saved favorite and a
 * library edit are written into those caches.
 */
export function useWorkflowLibraryHighlights() {
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const getWorkflows = useAuthedService(createWorkflowApiService);
  const getUsers = useAuthedService(createUsersService);
  const queryClient = useQueryClient();
  const translate = useTranslations('common.automation.workflows.library');
  const isScopeLoadable =
    isReady && Boolean(organizationId) && (pageScope !== 'brand' || !!brandId);
  const scopeKey = JSON.stringify([organizationId, pageScope, brandId ?? null]);
  const scopeRef = useRef(scopeKey);
  scopeRef.current = scopeKey;
  const savingScopeRef = useRef<string | null>(null);
  const [savingScope, setSavingScope] = useState<string | null>(null);

  const favoritesKey = useMemo<QueryKey>(
    () => [
      'workflow-library-favorites',
      organizationId,
      pageScope,
      brandId ?? null,
    ],
    [brandId, organizationId, pageScope],
  );
  const mostUsedKey = useMemo<QueryKey>(
    () => ['workflow-library-most-used', organizationId],
    [organizationId],
  );

  const favoritesQuery = useAuthedQuery<UsersService, FavoritesData>({
    enabled: isScopeLoadable,
    queryFn: async (users, signal) => {
      const settings = await users.findMeSettings(signal);
      const ids = settings.favoriteWorkflowIds ?? [];
      if (ids.length === 0) {
        return { ids, items: [] };
      }
      signal.throwIfAborted();
      try {
        const workflows = await getWorkflows();
        const visibleWorkflows = await workflows.listByIds(ids, signal);
        const byId = new Map(
          visibleWorkflows.map((workflow) => [workflow.id, workflow]),
        );
        const items = ids.flatMap((id) => {
          const workflow = byId.get(id);
          return workflow
            ? [{ ...workflow, nodeCount: workflow.nodes.length }]
            : [];
        });
        return { ids, items };
      } catch {
        // The saved ids stay known, so a retry does not lose them.
        throw new FavoriteWorkflowsReadError(ids);
      }
    },
    queryKey: favoritesKey,
    service: createUsersService,
  });

  const mostUsedQuery = useAuthedQuery<
    WorkflowApiService,
    WorkflowUsageSummary[]
  >({
    enabled: isScopeLoadable,
    queryFn: (workflows, signal) => workflows.listMostUsed(5, signal),
    queryKey: mostUsedKey,
    service: createWorkflowApiService,
  });

  const favoritesError = favoritesQuery.error;
  const favoriteIds =
    favoritesQuery.data?.ids ??
    (favoritesError instanceof FavoriteWorkflowsReadError
      ? favoritesError.favoriteIds
      : NO_IDS);
  const favorites = highlightState(
    favoritesQuery.data?.items,
    favoritesQuery.isPending,
    favoritesQuery.isFetching,
    favoritesQuery.isError,
  );
  const mostUsed = highlightState(
    mostUsedQuery.data,
    mostUsedQuery.isPending,
    mostUsedQuery.isFetching,
    mostUsedQuery.isError,
  );
  const isSavingFavorite = savingScope === scopeKey;

  // Each write first drops a read still in flight: it began before this
  // change and would otherwise land the old list (or a deleted workflow) back.
  const updateFavorites = useCallback(
    async (update: (current: FavoritesData) => FavoritesData) => {
      await queryClient.cancelQueries({ queryKey: favoritesKey });
      queryClient.setQueriesData<FavoritesData>(
        { queryKey: favoritesKey },
        (current) => (current ? update(current) : current),
      );
    },
    [favoritesKey, queryClient],
  );

  const updateMostUsed = useCallback(
    async (
      update: (current: WorkflowUsageSummary[]) => WorkflowUsageSummary[],
    ) => {
      await queryClient.cancelQueries({ queryKey: mostUsedKey });
      queryClient.setQueriesData<WorkflowUsageSummary[]>(
        { queryKey: mostUsedKey },
        (current) => (current ? update(current) : current),
      );
    },
    [mostUsedKey, queryClient],
  );

  const toggleFavorite = useCallback(
    async (workflow: WorkflowSummary) => {
      const scope = scopeKey;
      if (
        !isScopeLoadable ||
        favorites.isLoading ||
        favorites.hasError ||
        savingScopeRef.current === scope
      )
        return;
      const wasFavorite = favoriteIds.includes(workflow.id);
      if (!wasFavorite && favoriteIds.length >= 50) {
        NotificationsService.getInstance().error(translate('favoriteLimit'));
        return;
      }
      savingScopeRef.current = scope;
      setSavingScope(scope);
      try {
        const users = await getUsers();
        if (scopeRef.current !== scope) return;
        const settings = await users.patchMeFavoriteWorkflowIds(
          wasFavorite
            ? favoriteIds.filter((id) => id !== workflow.id)
            : [...favoriteIds, workflow.id],
        );
        if (scopeRef.current !== scope) return;
        const ids = settings.favoriteWorkflowIds ?? [];
        await updateFavorites((current) => ({
          ids,
          items: [
            ...current.items.filter((item) => item.id !== workflow.id),
            workflow,
          ].filter((item) => ids.includes(item.id)),
        }));
      } catch {
        if (scopeRef.current === scope)
          NotificationsService.getInstance().error(
            translate('favoriteSaveError'),
          );
      } finally {
        if (savingScopeRef.current === scope) savingScopeRef.current = null;
        setSavingScope((current) => (current === scope ? null : current));
      }
    },
    [
      favoriteIds,
      favorites.hasError,
      favorites.isLoading,
      getUsers,
      isScopeLoadable,
      scopeKey,
      translate,
      updateFavorites,
    ],
  );

  const updateWorkflow = useCallback(
    (id: string, update: Partial<WorkflowSummary>) => {
      void updateFavorites((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === id ? { ...item, ...update } : item,
        ),
      }));
      void updateMostUsed((current) =>
        current.map((item) => (item.id === id ? { ...item, ...update } : item)),
      );
    },
    [updateFavorites, updateMostUsed],
  );

  const removeWorkflow = useCallback(
    (id: string) => {
      void updateFavorites((current) => ({
        ids: current.ids.filter((item) => item !== id),
        items: current.items.filter((item) => item.id !== id),
      }));
      void updateMostUsed((current) =>
        current.filter((item) => item.id !== id),
      );
    },
    [updateFavorites, updateMostUsed],
  );

  const { refetch: refetchFavorites } = favoritesQuery;
  const { refetch: refetchMostUsed } = mostUsedQuery;
  const reload = useCallback(() => {
    if (!isScopeLoadable) return;
    void refetchFavorites();
    void refetchMostUsed();
  }, [isScopeLoadable, refetchFavorites, refetchMostUsed]);

  return {
    favorites: {
      ...favorites,
      items: favorites.items.filter(
        (item) => !brandId || item.brandId === brandId,
      ),
    },
    mostUsed,
    favoriteIds,
    isSavingFavorite,
    toggleFavorite,
    updateWorkflow,
    removeWorkflow,
    reload,
  };
}
