'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AgentAutonomyMode,
  normalizeAgentAutonomyMode,
} from '@genfeedai/contracts';
import type {
  IModel,
  IOrganizationSetting,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { ModelsService } from '@services/ai/models.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';

import AdvancedRoutingCard from './advanced-routing-card';
import AgentPolicyCard from './agent-policy-card';
import CreditGovernanceCard from './credit-governance-card';
import { resolveEnabledModelOptions } from './resolve-enabled-model-options';

type AgentPolicyState = NonNullable<IOrganizationSetting['agentPolicy']>;

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

type PolicyFormState = {
  agentDailyCreditCap: string;
  allowAdvancedOverrides: boolean;
  autonomyDefault: AgentAutonomyMode;
  brandDailyCreditCap: string;
  generationModelOverride: string;
  isSaving: boolean;
  qualityTierDefault: NonNullable<AgentPolicyState['qualityTierDefault']>;
  reviewModelOverride: string;
  thinkingModelOverride: string;
};

type PolicyFormAction =
  | { payload: PolicyFormState; type: 'INIT_FROM_SETTINGS' }
  | { payload: Partial<PolicyFormState>; type: 'MERGE' }
  | { payload: boolean; type: 'SET_IS_SAVING' };

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

function buildAgentPolicyPayload(form: PolicyFormState): AgentPolicyState {
  return {
    allowAdvancedOverrides: form.allowAdvancedOverrides,
    autonomyDefault: form.autonomyDefault,
    creditGovernance: {
      agentDailyCreditCap: toNumberOrNull(form.agentDailyCreditCap),
      brandDailyCreditCap: toNumberOrNull(form.brandDailyCreditCap),
      useOrganizationPool: true,
    },
    generationModelOverride:
      form.allowAdvancedOverrides && form.generationModelOverride
        ? form.generationModelOverride
        : null,
    qualityTierDefault: form.qualityTierDefault,
    reviewModelOverride:
      form.allowAdvancedOverrides && form.reviewModelOverride
        ? form.reviewModelOverride
        : null,
    thinkingModelOverride:
      form.allowAdvancedOverrides && form.thinkingModelOverride
        ? form.thinkingModelOverride
        : null,
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

  const { data: catalogModels = [] } = useQuery({
    enabled: Boolean(organizationId),
    queryFn: async (): Promise<IModel[]> => {
      const service = await getModelsService();
      return service.findAll({});
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

  const persistPolicy = useCallback(
    async (next: PolicyFormState) => {
      if (!organizationId) {
        return;
      }

      dispatch({ payload: true, type: 'SET_IS_SAVING' });
      try {
        const service = await getOrganizationsService();
        await service.patchSettings(organizationId, {
          agentPolicy: buildAgentPolicyPayload(next),
        });
        await refresh();
      } catch (error) {
        logger.error('Failed to update agent policy settings', error);
      } finally {
        dispatch({ payload: false, type: 'SET_IS_SAVING' });
      }
    },
    [getOrganizationsService, organizationId, refresh],
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

  const enabledModelIds = settings?.enabledModelIds ?? [];
  const modelOptions = useMemo(
    () => resolveEnabledModelOptions(enabledModelIds, catalogModels),
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
        allowAdvancedOverrides={allowAdvancedOverrides}
        generationModelOverride={generationModelOverride}
        modelOptions={modelOptions}
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
        reviewModelOverride={reviewModelOverride}
        thinkingModelOverride={thinkingModelOverride}
      />
    </div>
  );
}
