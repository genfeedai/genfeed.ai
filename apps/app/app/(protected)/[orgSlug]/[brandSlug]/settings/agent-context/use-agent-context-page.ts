'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type {
  IAgentBrandContextSnapshot,
  IAgentMemoryEntry,
  IBrandMemoryInsight,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { AgentContextPageState } from '@props/settings/agent-context.props';
import { AgentBrandContextService } from '@services/automation/agent-brand-context.service';
import { AgentMemoriesService } from '@services/automation/agent-memories.service';
import { BrandMemoryService } from '@services/automation/brand-memory.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

const INSIGHTS_LIMIT = 20;

/**
 * Data for the brand "Agent context" page: the snapshot the chat agent uses,
 * the full performance-insight list, and the memories the viewer may see.
 */
export function useAgentContextPage(): AgentContextPageState & {
  brandId: string;
  isReady: boolean;
} {
  const { brandId, isReady } = useBrand();
  const translate = useTranslations('pages.brandAgentContext');
  const notifications = NotificationsService.getInstance();
  const getContextService = useAuthedService((token: string) =>
    AgentBrandContextService.getInstance(token),
  );
  const getMemoriesService = useAuthedService((token: string) =>
    AgentMemoriesService.getInstance(token),
  );
  const getBrandMemoryService = useAuthedService((token: string) =>
    BrandMemoryService.getInstance(token),
  );

  const [snapshot, setSnapshot] = useState<IAgentBrandContextSnapshot | null>(
    null,
  );
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadError, setIsLoadError] = useState(false);
  const [insights, setInsights] = useState<IBrandMemoryInsight[] | null>(null);
  const [isInsightsError, setIsInsightsError] = useState(false);
  const [personalMemories, setPersonalMemories] = useState<
    IAgentMemoryEntry[] | null
  >(null);
  const [brandMemories, setBrandMemories] = useState<
    IAgentMemoryEntry[] | null
  >(null);
  const [isMemoriesError, setIsMemoriesError] = useState(false);
  const [pendingMemoryId, setPendingMemoryId] = useState<string | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is the explicit refresh trigger
  useEffect(() => {
    if (!isReady || !brandId) {
      return;
    }
    const controller = new AbortController();
    setIsRefreshing(true);
    setIsLoadError(false);

    const load = async () => {
      try {
        const service = await getContextService();
        const next = await service.getSnapshot(brandId, {
          query,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setSnapshot(next);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('GET /brands/:brandId/agent-context failed', error);
        setIsLoadError(true);
      } finally {
        if (!controller.signal.aborted) {
          setIsRefreshing(false);
        }
      }
    };

    void load();
    return () => controller.abort();
  }, [brandId, getContextService, isReady, query, reloadKey]);

  useEffect(() => {
    if (!isReady || !brandId) {
      return;
    }
    const controller = new AbortController();
    setInsights(null);
    setIsInsightsError(false);
    setPersonalMemories(null);
    setBrandMemories(null);
    setIsMemoriesError(false);

    const loadInsights = async () => {
      try {
        const service = await getBrandMemoryService();
        const next = await service.getInsights(brandId, {
          limit: INSIGHTS_LIMIT,
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setInsights(next);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('GET /brands/:brandId/memory/insights failed', error);
        setIsInsightsError(true);
        setInsights([]);
      }
    };

    const loadMemories = async () => {
      try {
        const service = await getMemoriesService();
        const [personal, brand] = await Promise.all([
          service.listPersonal(controller.signal),
          service.listForBrand(brandId, controller.signal),
        ]);
        if (!controller.signal.aborted) {
          setPersonalMemories(personal);
          setBrandMemories(brand);
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        logger.error('GET /agent/memories (personal/brand) failed', error);
        setIsMemoriesError(true);
        setPersonalMemories([]);
        setBrandMemories([]);
      }
    };

    void loadInsights();
    void loadMemories();
    return () => controller.abort();
  }, [brandId, getBrandMemoryService, getMemoriesService, isReady]);

  const refresh = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const preview = useCallback((nextQuery: string) => {
    setQuery(nextQuery.trim());
    setReloadKey((key) => key + 1);
  }, []);

  const archivePersonalMemory = useCallback(
    async (memoryId: string) => {
      setPendingMemoryId(memoryId);
      try {
        const service = await getMemoriesService();
        await service.archivePersonal(memoryId);
        setPersonalMemories(
          (current) =>
            current?.filter((memory) => memory.id !== memoryId) ?? current,
        );
        notifications.success(translate('memories.archived'));
        setReloadKey((key) => key + 1);
      } catch (error) {
        logger.error('Personal memory archive failed', error);
        notifications.error(translate('memories.archiveError'));
      } finally {
        setPendingMemoryId(null);
      }
    },
    [getMemoriesService, notifications, translate],
  );

  return {
    archivePersonalMemory,
    brandId,
    brandMemories,
    insights,
    isInsightsError,
    isLoadError,
    isMemoriesError,
    isReady,
    isRefreshing,
    pendingMemoryId,
    personalMemories,
    preview,
    refresh,
    snapshot,
  };
}
