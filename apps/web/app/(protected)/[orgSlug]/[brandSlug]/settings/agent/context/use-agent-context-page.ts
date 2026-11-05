'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  IAgentBrandContextSnapshot,
  IAgentMemoryEntry,
  IBrandMemoryInsight,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AgentBrandContextService } from '@services/automation/agent-brand-context.service';
import { AgentMemoriesService } from '@services/automation/agent-memories.service';
import { BrandMemoryService } from '@services/automation/brand-memory.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import type { AgentContextPageState } from '@/features/settings/props/context.props';

const INSIGHTS_LIMIT = 20;
const EMPTY_MEMORIES: IAgentMemoryEntry[] = [];
const EMPTY_INSIGHTS: IBrandMemoryInsight[] = [];

/** The base key of the agent-memories read; personal memories span brands. */
const AGENT_MEMORIES_KEY = 'agent-context-memories';

interface AgentContextMemories {
  brand: IAgentMemoryEntry[];
  personal: IAgentMemoryEntry[];
}

function createMemoriesService(token: string): AgentMemoriesService {
  return AgentMemoriesService.getInstance(token);
}

/**
 * Data for the brand "Agent context" page: the snapshot the chat agent uses,
 * the full performance-insight list, and the memories the viewer may see.
 *
 * Each read is cached per viewer and brand (the snapshot also per preview
 * query), so returning to the page paints the last context at once and
 * refreshes it in the background. A preview keeps the current snapshot on
 * screen while the new one loads; another brand never sees this one's data.
 */
export function useAgentContextPage(): AgentContextPageState & {
  brandId: string;
  isReady: boolean;
} {
  const { brandId, isReady } = useBrand();
  const translate = useTranslations('pages.brandAgentContext');
  const notifications = NotificationsService.getInstance();
  const queryClient = useQueryClient();
  const getMemoriesService = useAuthedService(createMemoriesService);
  const isScopeReady = isReady && Boolean(brandId);

  const [query, setQuery] = useState('');
  const [pendingMemoryId, setPendingMemoryId] = useState<string | null>(null);

  const snapshotScopeKey = ['agent-context-snapshot', brandId || null];
  const snapshotQuery = useAuthedQuery<
    AgentBrandContextService,
    IAgentBrandContextSnapshot
  >({
    enabled: isScopeReady,
    keepPreviousDataWithin: snapshotScopeKey,
    queryFn: async (service, signal) => {
      try {
        return await service.getSnapshot(brandId, { query, signal });
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /brands/:brandId/agent-context failed', error);
        }
        throw error;
      }
    },
    queryKey: [...snapshotScopeKey, query],
    service: (token: string) => AgentBrandContextService.getInstance(token),
  });

  const insightsQuery = useAuthedQuery<
    BrandMemoryService,
    IBrandMemoryInsight[]
  >({
    enabled: isScopeReady,
    queryFn: async (service, signal) => {
      try {
        return await service.getInsights(brandId, {
          limit: INSIGHTS_LIMIT,
          signal,
        });
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /brands/:brandId/memory/insights failed', error);
        }
        throw error;
      }
    },
    queryKey: ['agent-context-insights', brandId || null, INSIGHTS_LIMIT],
    service: (token: string) => BrandMemoryService.getInstance(token),
  });

  const memoriesQuery = useAuthedQuery<
    AgentMemoriesService,
    AgentContextMemories
  >({
    enabled: isScopeReady,
    queryFn: async (service, signal) => {
      try {
        const [personal, brand] = await Promise.all([
          service.listPersonal(signal),
          service.listForBrand(brandId, signal),
        ]);
        return { brand, personal };
      } catch (error) {
        if (!signal.aborted) {
          logger.error('GET /agent/memories (personal/brand) failed', error);
        }
        throw error;
      }
    },
    queryKey: [AGENT_MEMORIES_KEY, brandId || null],
    service: createMemoriesService,
  });

  const { refetch: refetchSnapshot } = snapshotQuery;
  const refresh = useCallback(() => {
    void refetchSnapshot();
  }, [refetchSnapshot]);

  const preview = useCallback(
    (nextQuery: string) => {
      const trimmed = nextQuery.trim();
      if (trimmed === query) {
        void refetchSnapshot();
        return;
      }
      setQuery(trimmed);
    },
    [query, refetchSnapshot],
  );

  const archivePersonalMemory = useCallback(
    async (memoryId: string) => {
      setPendingMemoryId(memoryId);
      try {
        const service = await getMemoriesService();
        await service.archivePersonal(memoryId);
        // Personal memories show under every brand: drop it from each.
        queryClient.setQueriesData<AgentContextMemories>(
          { queryKey: [AGENT_MEMORIES_KEY] },
          (current) =>
            current && {
              ...current,
              personal: current.personal.filter(
                (memory) => memory.id !== memoryId,
              ),
            },
        );
        notifications.success(translate('memories.archived'));
        void refetchSnapshot();
      } catch (error) {
        logger.error('Personal memory archive failed', error);
        notifications.error(translate('memories.archiveError'));
      } finally {
        setPendingMemoryId(null);
      }
    },
    [
      getMemoriesService,
      notifications,
      queryClient,
      refetchSnapshot,
      translate,
    ],
  );

  const snapshot = snapshotQuery.data ?? null;
  // A failed refresh keeps the snapshot on screen; a retry shows the loader.
  const isLoadError =
    snapshotQuery.isError && !snapshot && !snapshotQuery.isFetching;

  const insights = insightsQuery.data;
  const isInsightsError = insightsQuery.isError && insights === undefined;
  const memories = memoriesQuery.data;
  const isMemoriesError = memoriesQuery.isError && memories === undefined;

  return {
    archivePersonalMemory,
    brandId,
    brandMemories: memories?.brand ?? (isMemoriesError ? EMPTY_MEMORIES : null),
    insights: insights ?? (isInsightsError ? EMPTY_INSIGHTS : null),
    isInsightsError,
    isLoadError,
    isMemoriesError,
    isReady,
    isRefreshing: snapshotQuery.isFetching,
    pendingMemoryId,
    personalMemories:
      memories?.personal ?? (isMemoriesError ? EMPTY_MEMORIES : null),
    preview,
    refresh,
    snapshot,
  };
}
