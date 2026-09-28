'use client';

import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { NotificationsService } from '@services/core/notifications.service';
import { UsersService } from '@services/organization/users.service';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createWorkflowApiService,
  type WorkflowSummary,
  type WorkflowUsageSummary,
} from '@/features/workflows/services/workflow-api';

interface HighlightState<T> {
  items: T[];
  isLoading: boolean;
  hasError: boolean;
}

const EMPTY_STATE = { items: [], isLoading: true, hasError: false };

/** Favorites and org usage settle independently of the paginated library. */
export function useWorkflowLibraryHighlights() {
  const { brandId, isReady, organizationId, pageScope } = useCollectionScope();
  const getWorkflows = useAuthedService(createWorkflowApiService);
  const getUsers = useAuthedService((token) => UsersService.getInstance(token));
  const translate = useTranslations('common.automation.workflows.library');
  const [favorites, setFavorites] =
    useState<HighlightState<WorkflowSummary>>(EMPTY_STATE);
  const [mostUsed, setMostUsed] =
    useState<HighlightState<WorkflowUsageSummary>>(EMPTY_STATE);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [revision, setRevision] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const savingRequest = useRef<AbortController | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision explicitly retries the section requests.
  useEffect(() => {
    const controller = new AbortController();
    activeRequest.current = controller;
    setFavorites(EMPTY_STATE);
    setMostUsed(EMPTY_STATE);
    setFavoriteIds([]);
    setIsSavingFavorite(false);
    if (!isReady || !organizationId || (pageScope === 'brand' && !brandId)) {
      return () => controller.abort();
    }

    void (async () => {
      try {
        const users = await getUsers();
        const settings = await users.findMeSettings(controller.signal);
        if (controller.signal.aborted) return;
        const ids = settings.favoriteWorkflowIds ?? [];
        setFavoriteIds(ids);
        const results = await Promise.allSettled(
          ids.map(async (id) => {
            const workflows = await getWorkflows();
            const workflow = await workflows.get(id);
            return { ...workflow, nodeCount: workflow.nodes.length };
          }),
        );
        if (!controller.signal.aborted) {
          const items = results.flatMap((result) =>
            result.status === 'fulfilled' ? [result.value] : [],
          );
          setFavorites({ items, isLoading: false, hasError: false });
        }
      } catch {
        if (!controller.signal.aborted) {
          setFavorites({ items: [], isLoading: false, hasError: true });
        }
      }
    })();
    void (async () => {
      try {
        const workflows = await getWorkflows();
        const items = await workflows.listMostUsed(5);
        if (!controller.signal.aborted) {
          setMostUsed({ items, isLoading: false, hasError: false });
        }
      } catch {
        if (!controller.signal.aborted) {
          setMostUsed({ items: [], isLoading: false, hasError: true });
        }
      }
    })();
    return () => controller.abort();
  }, [
    brandId,
    getUsers,
    getWorkflows,
    isReady,
    organizationId,
    pageScope,
    revision,
  ]);

  const toggleFavorite = useCallback(
    async (workflow: WorkflowSummary) => {
      const request = activeRequest.current;
      if (
        !request ||
        request.signal.aborted ||
        favorites.isLoading ||
        favorites.hasError ||
        savingRequest.current === request
      )
        return;
      const wasFavorite = favoriteIds.includes(workflow.id);
      if (!wasFavorite && favoriteIds.length >= 50) {
        NotificationsService.getInstance().error(translate('favoriteLimit'));
        return;
      }
      savingRequest.current = request;
      setIsSavingFavorite(true);
      try {
        const users = await getUsers();
        if (request.signal.aborted) return;
        const settings = await users.patchMeFavoriteWorkflowIds(
          wasFavorite
            ? favoriteIds.filter((id) => id !== workflow.id)
            : [...favoriteIds, workflow.id],
        );
        if (request.signal.aborted) return;
        const ids = settings.favoriteWorkflowIds ?? [];
        setFavoriteIds(ids);
        setFavorites((current) => ({
          ...current,
          items: [
            ...current.items.filter((item) => item.id !== workflow.id),
            workflow,
          ].filter((item) => ids.includes(item.id)),
        }));
      } catch {
        if (!request.signal.aborted)
          NotificationsService.getInstance().error(
            translate('favoriteSaveError'),
          );
      } finally {
        if (savingRequest.current === request) savingRequest.current = null;
        if (!request.signal.aborted) setIsSavingFavorite(false);
      }
    },
    [favoriteIds, favorites.hasError, favorites.isLoading, getUsers, translate],
  );

  const updateWorkflow = useCallback(
    (id: string, update: Partial<WorkflowSummary>) => {
      setFavorites((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === id ? { ...item, ...update } : item,
        ),
      }));
      setMostUsed((current) => ({
        ...current,
        items: current.items.map((item) =>
          item.id === id ? { ...item, ...update } : item,
        ),
      }));
    },
    [],
  );

  const removeWorkflow = useCallback((id: string) => {
    setFavorites((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
    }));
    setMostUsed((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== id),
    }));
    setFavoriteIds((current) => current.filter((item) => item !== id));
  }, []);

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
    reload: () => setRevision((value) => value + 1),
  };
}
