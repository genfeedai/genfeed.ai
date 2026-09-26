import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentAutonomyMode,
  normalizeAgentAutonomyMode,
} from '@genfeedai/contracts';
import type { IModel } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAgentModelAccess } from '@hooks/data/billing/use-agent-model-access/use-agent-model-access';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import type {
  AgentPolicyState,
  OverrideCategoryModels,
  PolicyFormAction,
  PolicyFormState,
} from '@props/settings/policy.props';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import AdvancedRoutingCard from './advanced-routing-card';
import AgentPolicyCard from './agent-policy-card';
import CreditGovernanceCard from './credit-governance-card';
import {
  AGENT_GENERATION_MODEL_CATEGORIES,
  AGENT_REVIEW_MODEL_CATEGORIES,
  AGENT_THINKING_MODEL_CATEGORIES,
  resolveEnabledModelOptions,
  resolveEnabledModelsForCategory,
  resolveStoredAgentModelKey,
} from './resolve-enabled-model-options';

const EMPTY_CATALOG_MODELS: IModel[] = [];

const QUALITY_TIER_OPTIONS: Array<{
  description: string;
  label: string;
  value: NonNullable<AgentPolicyState['qualityTierDefault']>;
}> = [
  {
    description: 'Lower credit usage and lighter model routing.',
    label: 'Budget',
    value: 'budget',
  },
  {
    description: 'Default routing for most teams.',
    label: 'Balanced',
    value: 'balanced',
  },
  {
    description: 'Bias toward quality-first execution.',
    label: 'High Quality',
    value: 'high_quality',
  },
];

function toNumberOrNull(value: string): number | null {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

const initialPolicyFormState: PolicyFormState = {
  agentDailyCreditCap: '',
  allowAdvancedOverrides: false,
  autonomyDefault: AgentAutonomyMode.SUPERVISED,
  brandDailyCreditCap: '',
  generationModelOverride: '',
  isSaving: false,
  qualityTierDefault: 'balanced',
  reviewModelOverride: '',
  thinkingModelOverride: '',
};

function policyFormReducer(
  state: PolicyFormState,
  action: PolicyFormAction,
): PolicyFormState {
  switch (action.type) {
    case 'INIT_FROM_SETTINGS':
      return { ...state, ...action.payload };
    case 'MERGE':
      return { ...state, ...action.payload };
    case 'SET_IS_SAVING':
      return { ...state, isSaving: action.payload };
    default:
      return state;
  }
}

/**
 * Model override keys are only ever safe to persist once the catalog has
 * loaded successfully — without it there is nothing to validate a stored
 * key against, so overrides are deferred (omitted from the payload) rather
 * than resolved against an empty or stale list. Each override is then
 * validated against its own selector's category-and-enabled model list, not
 * the full catalog, so a key enabled only for another selector can't slip
 * through.
 */
function buildAgentPolicyPayload(
  form: PolicyFormState,
  categoryModels: OverrideCategoryModels,
  isCatalogLoaded: boolean,
): AgentPolicyState {
  const overrides: Pick<
    AgentPolicyState,
    'generationModelOverride' | 'reviewModelOverride' | 'thinkingModelOverride'
  > = {};

  if (!form.allowAdvancedOverrides) {
    overrides.generationModelOverride = null;
    overrides.reviewModelOverride = null;
    overrides.thinkingModelOverride = null;
  } else if (isCatalogLoaded) {
    overrides.generationModelOverride =
      resolveStoredAgentModelKey(
        form.generationModelOverride,
        categoryModels.generation,
      ) || null;
    overrides.reviewModelOverride =
      resolveStoredAgentModelKey(
        form.reviewModelOverride,
        categoryModels.review,
      ) || null;
    overrides.thinkingModelOverride =
      resolveStoredAgentModelKey(
        form.thinkingModelOverride,
        categoryModels.thinking,
      ) || null;
  }
  // else: catalog has not loaded (or failed to load) — defer by omitting the
  // override keys entirely so a save never persists an unvalidated value.

  return {
    allowAdvancedOverrides: form.allowAdvancedOverrides,
    autonomyDefault: form.autonomyDefault,
    creditGovernance: {
      agentDailyCreditCap: toNumberOrNull(form.agentDailyCreditCap),
      brandDailyCreditCap: toNumberOrNull(form.brandDailyCreditCap),
      useOrganizationPool: true,
    },
    qualityTierDefault: form.qualityTierDefault,
    ...overrides,
  };
}

export default function SettingsAgentsPage() {
  const { organizationId } = useBrand();
  const { refresh, settings } = useOrganization();
  const [state, dispatch] = useReducer(
    policyFormReducer,
    initialPolicyFormState,
  );
  const stateRef = useRef(state);
  stateRef.current = state;
  const creditSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const {
    agentDailyCreditCap,
    allowAdvancedOverrides,
    autonomyDefault,
    brandDailyCreditCap,
    generationModelOverride,
    isSaving,
    qualityTierDefault,
    reviewModelOverride,
    thinkingModelOverride,
  } = state;

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );
  const getModelsService = useAuthedService((token: string) =>
    ModelsService.getInstance(token),
  );

  const { modelAccess, modelCosts } = useAgentModelAccess();

  const {
    data: catalogModels = EMPTY_CATALOG_MODELS,
    isSuccess: isCatalogLoaded,
  } = useQuery({
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<IModel[]> => {
      const service = await getModelsService();
      return service.findAllPages({});
    },
    queryKey: ['settings-agent-model-catalog', organizationId],
  });

  useEffect(() => {
    const agentPolicy = settings?.agentPolicy;
    dispatch({
      payload: {
        agentDailyCreditCap:
          agentPolicy?.creditGovernance?.agentDailyCreditCap?.toString() ?? '',
        allowAdvancedOverrides: agentPolicy?.allowAdvancedOverrides ?? false,
        autonomyDefault: normalizeAgentAutonomyMode(
          agentPolicy?.autonomyDefault,
        ),
        brandDailyCreditCap:
          agentPolicy?.creditGovernance?.brandDailyCreditCap?.toString() ?? '',
        generationModelOverride: agentPolicy?.generationModelOverride ?? '',
        isSaving: false,
        qualityTierDefault: agentPolicy?.qualityTierDefault ?? 'balanced',
        reviewModelOverride: agentPolicy?.reviewModelOverride ?? '',
        thinkingModelOverride: agentPolicy?.thinkingModelOverride ?? '',
      },
      type: 'INIT_FROM_SETTINGS',
    });
  }, [settings?.agentPolicy]);

  useEffect(() => {
    return () => {
      if (creditSaveTimeoutRef.current) {
        clearTimeout(creditSaveTimeoutRef.current);
      }
    };
  }, []);

  const enabledModelIds = settings?.enabledModelIds ?? [];
  const thinkingCategoryModels = useMemo(
    () =>
      resolveEnabledModelsForCategory(
        enabledModelIds,
        catalogModels,
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const generationCategoryModels = useMemo(
    () =>
      resolveEnabledModelsForCategory(
        enabledModelIds,
        catalogModels,
        AGENT_GENERATION_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const reviewCategoryModels = useMemo(
    () =>
      resolveEnabledModelsForCategory(
        enabledModelIds,
        catalogModels,
        AGENT_REVIEW_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const categoryModels = useMemo<OverrideCategoryModels>(
    () => ({
      generation: generationCategoryModels,
      review: reviewCategoryModels,
      thinking: thinkingCategoryModels,
    }),
    [generationCategoryModels, reviewCategoryModels, thinkingCategoryModels],
  );

  const persistPolicy = useCallback(
    async (next: PolicyFormState) => {
      if (!organizationId) {
        return;
      }

      dispatch({ payload: true, type: 'SET_IS_SAVING' });
      try {
        const service = await getOrganizationsService();
        await service.patchSettings(organizationId, {
          agentPolicy: buildAgentPolicyPayload(
            next,
            categoryModels,
            isCatalogLoaded,
          ),
        });
        await refresh();
      } catch (error) {
        logger.error('Failed to update agent policy settings', error);
      } finally {
        dispatch({ payload: false, type: 'SET_IS_SAVING' });
      }
    },
    [
      categoryModels,
      getOrganizationsService,
      isCatalogLoaded,
      organizationId,
      refresh,
    ],
  );

  const updateAndPersist = useCallback(
    (patch: Partial<PolicyFormState>) => {
      const next = { ...stateRef.current, ...patch, isSaving: false };
      dispatch({ payload: next, type: 'MERGE' });
      void persistPolicy(next);
    },
    [persistPolicy],
  );

  const updateCreditField = useCallback(
    (patch: Partial<PolicyFormState>) => {
      const next = { ...stateRef.current, ...patch, isSaving: false };
      dispatch({ payload: next, type: 'MERGE' });

      if (creditSaveTimeoutRef.current) {
        clearTimeout(creditSaveTimeoutRef.current);
      }
      // Debounce number fields so mid-typing does not spam PATCH.
      creditSaveTimeoutRef.current = setTimeout(() => {
        void persistPolicy({ ...stateRef.current, ...patch, isSaving: false });
      }, 400);
    },
    [persistPolicy],
  );

  const thinkingModelOptions = useMemo(
    () =>
      resolveEnabledModelOptions(
        enabledModelIds,
        catalogModels,
        AGENT_THINKING_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const generationModelOptions = useMemo(
    () =>
      resolveEnabledModelOptions(
        enabledModelIds,
        catalogModels,
        AGENT_GENERATION_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );
  const reviewModelOptions = useMemo(
    () =>
      resolveEnabledModelOptions(
        enabledModelIds,
        catalogModels,
        AGENT_REVIEW_MODEL_CATEGORIES,
      ),
    [catalogModels, enabledModelIds],
  );

  return (
    <div className="space-y-4">
      <AgentPolicyCard
        autonomyDefault={autonomyDefault}
        isSaving={isSaving}
        onAutonomyDefaultChange={(value) =>
          updateAndPersist({ autonomyDefault: value })
        }
        onQualityTierDefaultChange={(value) =>
          updateAndPersist({ qualityTierDefault: value })
        }
        qualityTierDefault={qualityTierDefault}
        qualityTierOptions={QUALITY_TIER_OPTIONS}
      />

      <CreditGovernanceCard
        agentDailyCreditCap={agentDailyCreditCap}
        brandDailyCreditCap={brandDailyCreditCap}
        onAgentDailyCreditCapChange={(value) =>
          updateCreditField({ agentDailyCreditCap: value })
        }
        onBrandDailyCreditCapChange={(value) =>
          updateCreditField({ brandDailyCreditCap: value })
        }
      />

      <AdvancedRoutingCard
        agentModelAccess={modelAccess}
        allowAdvancedOverrides={allowAdvancedOverrides}
        generationModelOptions={generationModelOptions}
        generationModelOverride={resolveStoredAgentModelKey(
          generationModelOverride,
          generationCategoryModels,
        )}
        modelCostEstimates={modelCosts}
        isSaving={isSaving}
        onAllowAdvancedOverridesChange={(value) =>
          updateAndPersist({ allowAdvancedOverrides: value })
        }
        onGenerationModelOverrideChange={(value) =>
          updateAndPersist({ generationModelOverride: value })
        }
        onReviewModelOverrideChange={(value) =>
          updateAndPersist({ reviewModelOverride: value })
        }
        onThinkingModelOverrideChange={(value) =>
          updateAndPersist({ thinkingModelOverride: value })
        }
        reviewModelOptions={reviewModelOptions}
        reviewModelOverride={resolveStoredAgentModelKey(
          reviewModelOverride,
          reviewCategoryModels,
        )}
        thinkingModelOptions={thinkingModelOptions}
        thinkingModelOverride={resolveStoredAgentModelKey(
          thinkingModelOverride,
          thinkingCategoryModels,
        )}
      />
    </div>
  );
}
