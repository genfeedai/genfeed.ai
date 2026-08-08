import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  AGENT_CHAT_CAPABILITY,
  isRetiredAgentChatModel,
} from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { ModelsService } from '@services/ai/models.service';
import { useEffect, useState } from 'react';

const REGISTRY_PAGE_LIMIT = 100;

function isAgentChatRegistryModel(model: IModel): boolean {
  if (model.category !== ModelCategory.TEXT) {
    return false;
  }
  // Keep inactive and fully retired keys out. Legacy/active-but-deprecated
  // rows still load so the picker can offer a Legacy rail filter.
  if (model.isActive === false) {
    return false;
  }
  if (isRetiredAgentChatModel(model.key)) {
    return false;
  }

  const capabilities = model.capabilities ?? [];
  const recommended = model.recommendedFor ?? [];

  return (
    capabilities.includes(AGENT_CHAT_CAPABILITY) ||
    recommended.includes(AGENT_CHAT_CAPABILITY) ||
    model.provider === 'openrouter' ||
    // Legacy catalogue rows may lack modern capability tags.
    model.isLegacy === true
  );
}

/**
 * Loads agent chat models from the Model registry only (Phase D / #2422).
 * Returns full `IModel` rows so the shared `ModelSelectorPopover` can render
 * them — no parallel AgentModelSelector catalog.
 */
export function useAgentRegistryModels(apiService: AgentApiService | null): {
  defaultModelKey: string | null;
  isLoading: boolean;
  models: readonly IModel[];
} {
  const [models, setModels] = useState<readonly IModel[]>([]);
  const [defaultModelKey, setDefaultModelKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(apiService));

  useEffect(() => {
    if (!apiService) {
      setModels([]);
      setDefaultModelKey(null);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    setIsLoading(true);

    void (async () => {
      try {
        const token = await apiService.getToken();
        if (!token || isCancelled || controller.signal.aborted) {
          return;
        }

        const rows = await ModelsService.getInstance(token).findAll(
          {
            category: ModelCategory.TEXT,
            isActive: true,
            limit: REGISTRY_PAGE_LIMIT,
            sort: 'label: 1',
          },
          controller.signal,
        );

        if (isCancelled || controller.signal.aborted) {
          return;
        }

        const agentRows = rows
          .filter(isAgentChatRegistryModel)
          .toSorted((left, right) => {
            const leftCost =
              typeof left.cost === 'number'
                ? left.cost
                : Number.POSITIVE_INFINITY;
            const rightCost =
              typeof right.cost === 'number'
                ? right.cost
                : Number.POSITIVE_INFINITY;
            if (leftCost !== rightCost) {
              return leftCost - rightCost;
            }
            return left.label.localeCompare(right.label);
          });

        const defaultRow =
          agentRows.find((row) => row.isDefault) ??
          agentRows.find((row) => row.isHighlighted) ??
          agentRows[0];

        setModels(agentRows);
        setDefaultModelKey(defaultRow?.key ?? null);
      } catch {
        if (!isCancelled) {
          setModels([]);
          setDefaultModelKey(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [apiService]);

  return { defaultModelKey, isLoading, models };
}
