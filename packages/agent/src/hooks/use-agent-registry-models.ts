import type { AgentModelOption } from '@genfeedai/agent/constants/agent-models.constant';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import { isRetiredAgentChatModel } from '@genfeedai/constants';
import { type CostTier, ModelCategory } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { ModelsService } from '@services/ai/models.service';
import { useEffect, useState } from 'react';

const AGENT_CHAT_CAPABILITY = 'agent-chat';

function mapRegistryModelToOption(model: IModel): AgentModelOption {
  const costTier = model.costTier as CostTier | undefined;
  return {
    brandSlug: model.provider || 'openrouter',
    description: model.description || model.label,
    key: model.key,
    label: model.label,
    ...(typeof model.cost === 'number' && model.cost > 0
      ? { creditCost: Math.max(1, Math.round(model.cost)) }
      : {}),
    ...(costTier ? { costTier } : {}),
  };
}

function isAgentChatRegistryModel(model: IModel): boolean {
  if (model.category !== ModelCategory.TEXT && model.category !== 'text') {
    return false;
  }
  if (model.isLegacy || model.isActive === false) {
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
    model.provider === 'openrouter'
  );
}

/**
 * Loads agent chat models from the Model registry only (Phase D / #2422).
 * No silent constants fallback — empty list means seed/API is incomplete.
 */
export function useAgentRegistryModels(apiService: AgentApiService | null): {
  defaultModelKey: string | null;
  isLoading: boolean;
  models: readonly AgentModelOption[];
} {
  const [models, setModels] = useState<readonly AgentModelOption[]>([]);
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
    let cancelled = false;

    setIsLoading(true);

    void (async () => {
      try {
        const token = await apiService.getToken();
        if (!token || cancelled) {
          return;
        }

        const service = ModelsService.getInstance(token);
        const rows = await service.findAll({
          category: ModelCategory.TEXT,
          isActive: true,
          limit: 100,
          sort: 'label: 1',
        });

        if (cancelled || controller.signal.aborted) {
          return;
        }

        const agentRows = rows.filter(isAgentChatRegistryModel);
        const options = agentRows
          .map(mapRegistryModelToOption)
          .toSorted((left, right) => {
            const leftCost = left.creditCost ?? Number.POSITIVE_INFINITY;
            const rightCost = right.creditCost ?? Number.POSITIVE_INFINITY;
            if (leftCost !== rightCost) {
              return leftCost - rightCost;
            }
            return left.label.localeCompare(right.label);
          });

        const defaultRow =
          agentRows.find((row) => row.isDefault) ??
          agentRows.find((row) => row.isHighlighted) ??
          agentRows[0];

        setModels(options);
        setDefaultModelKey(defaultRow?.key ?? null);
      } catch {
        if (!cancelled) {
          setModels([]);
          setDefaultModelKey(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [apiService]);

  return { defaultModelKey, isLoading, models };
}
