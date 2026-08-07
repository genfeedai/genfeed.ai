import type { AgentModelOption } from '@genfeedai/agent/constants/agent-models.constant';
import { AGENT_MODELS } from '@genfeedai/agent/constants/agent-models.constant';
import type { AgentApiService } from '@genfeedai/agent/services/agent-api.service';
import {
  AGENT_CHAT_CAPABILITY,
  isRetiredAgentChatModel,
  REASONING_FEATURE,
} from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import type { IModel } from '@genfeedai/interfaces';
import { ModelsService } from '@services/ai/models.service';
import { useEffect, useState } from 'react';

const REGISTRY_PAGE_LIMIT = 100;

/**
 * Logo slug for the model's vendor.
 *
 * Registry keys are OpenRouter-shaped (`anthropic/claude-opus-5`), so the
 * prefix is the vendor. Self-hosted keys (`local/…`) name no vendor — their
 * provider (`genfeed-ai`) is the slug instead.
 */
function brandSlugFromModel(model: IModel): string {
  const [prefix] = model.key.split('/');

  return prefix && prefix !== 'local' ? prefix : model.provider;
}

function mapRegistryModelToOption(model: IModel): AgentModelOption {
  const isReasoning = (model.supportsFeatures ?? []).includes(
    REASONING_FEATURE,
  );

  return {
    brandSlug: brandSlugFromModel(model),
    description: model.description || model.label,
    key: model.key,
    label: model.label,
    ...(typeof model.cost === 'number' && model.cost > 0
      ? { creditCost: Math.max(1, Math.round(model.cost)) }
      : {}),
    ...(model.costTier ? { costTier: model.costTier } : {}),
    ...(isReasoning ? { isReasoning: true } : {}),
  };
}

function isAgentChatRegistryModel(model: IModel): boolean {
  if (model.category !== ModelCategory.TEXT) {
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
    recommended.includes(AGENT_CHAT_CAPABILITY)
  );
}

/**
 * Loads agent chat models from the unified `Model` registry.
 *
 * Falls back to the hard-coded catalogue while the registry seed rolls out, so
 * the picker never goes blank mid-migration. That fallback is temporary — once
 * the boot seed is proven in cloud, an empty registry becomes an empty picker
 * rather than a silently re-expanded constants list (#2422 phase D).
 */
export function useAgentRegistryModels(apiService: AgentApiService | null): {
  isLoading: boolean;
  models: readonly AgentModelOption[];
} {
  const [models, setModels] =
    useState<readonly AgentModelOption[]>(AGENT_MODELS);
  const [isLoading, setIsLoading] = useState(Boolean(apiService));

  useEffect(() => {
    if (!apiService) {
      setModels(AGENT_MODELS);
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

        const options = rows
          .filter(isAgentChatRegistryModel)
          .map(mapRegistryModelToOption)
          .toSorted((left, right) => {
            const leftCost = left.creditCost ?? Number.POSITIVE_INFINITY;
            const rightCost = right.creditCost ?? Number.POSITIVE_INFINITY;
            if (leftCost !== rightCost) {
              return leftCost - rightCost;
            }
            return left.label.localeCompare(right.label);
          });

        setModels(options.length > 0 ? options : AGENT_MODELS);
      } catch {
        if (!isCancelled) {
          setModels(AGENT_MODELS);
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

  return { isLoading, models };
}
