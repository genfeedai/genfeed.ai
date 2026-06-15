'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AgentAutonomyMode } from '@genfeedai/enums';
import type { IOrganizationSetting } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import { useCallback, useEffect, useReducer } from 'react';

import AdvancedRoutingCard from './advanced-routing-card';
import AgentPolicyCard from './agent-policy-card';
import CreditGovernanceCard from './credit-governance-card';

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
  | { payload: string; type: 'SET_AGENT_DAILY_CREDIT_CAP' }
  | { payload: boolean; type: 'SET_ALLOW_ADVANCED_OVERRIDES' }
  | { payload: AgentAutonomyMode; type: 'SET_AUTONOMY_DEFAULT' }
  | { payload: string; type: 'SET_BRAND_DAILY_CREDIT_CAP' }
  | { payload: string; type: 'SET_GENERATION_MODEL_OVERRIDE' }
  | { payload: boolean; type: 'SET_IS_SAVING' }
  | {
      payload: NonNullable<AgentPolicyState['qualityTierDefault']>;
      type: 'SET_QUALITY_TIER_DEFAULT';
    }
  | { payload: string; type: 'SET_REVIEW_MODEL_OVERRIDE' }
  | { payload: string; type: 'SET_THINKING_MODEL_OVERRIDE' };

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
    case 'SET_AGENT_DAILY_CREDIT_CAP':
      return { ...state, agentDailyCreditCap: action.payload };
    case 'SET_ALLOW_ADVANCED_OVERRIDES':
      return { ...state, allowAdvancedOverrides: action.payload };
    case 'SET_AUTONOMY_DEFAULT':
      return { ...state, autonomyDefault: action.payload };
    case 'SET_BRAND_DAILY_CREDIT_CAP':
      return { ...state, brandDailyCreditCap: action.payload };
    case 'SET_GENERATION_MODEL_OVERRIDE':
      return { ...state, generationModelOverride: action.payload };
    case 'SET_IS_SAVING':
      return { ...state, isSaving: action.payload };
    case 'SET_QUALITY_TIER_DEFAULT':
      return { ...state, qualityTierDefault: action.payload };
    case 'SET_REVIEW_MODEL_OVERRIDE':
      return { ...state, reviewModelOverride: action.payload };
    case 'SET_THINKING_MODEL_OVERRIDE':
      return { ...state, thinkingModelOverride: action.payload };
    default:
      return state;
  }
}

export default function SettingsAgentsPage() {
  const { organizationId } = useBrand();
  const { refresh, settings } = useOrganization();
  const [state, dispatch] = useReducer(
    policyFormReducer,
    initialPolicyFormState,
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

  useEffect(() => {
    const agentPolicy = settings?.agentPolicy;
    dispatch({
      payload: {
        agentDailyCreditCap:
          agentPolicy?.creditGovernance?.agentDailyCreditCap?.toString() ?? '',
        allowAdvancedOverrides: agentPolicy?.allowAdvancedOverrides ?? false,
        autonomyDefault:
          (agentPolicy?.autonomyDefault as AgentAutonomyMode | undefined) ??
          AgentAutonomyMode.SUPERVISED,
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

  const handleSave = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    dispatch({ payload: true, type: 'SET_IS_SAVING' });
    try {
      const service = await getOrganizationsService();
      await service.patchSettings(organizationId, {
        agentPolicy: {
          allowAdvancedOverrides,
          autonomyDefault,
          creditGovernance: {
            agentDailyCreditCap: toNumberOrNull(agentDailyCreditCap),
            brandDailyCreditCap: toNumberOrNull(brandDailyCreditCap),
            useOrganizationPool: true,
          },
          generationModelOverride:
            allowAdvancedOverrides && generationModelOverride
              ? generationModelOverride
              : null,
          qualityTierDefault,
          reviewModelOverride:
            allowAdvancedOverrides && reviewModelOverride
              ? reviewModelOverride
              : null,
          thinkingModelOverride:
            allowAdvancedOverrides && thinkingModelOverride
              ? thinkingModelOverride
              : null,
        },
      });
      await refresh();
    } catch (error) {
      logger.error('Failed to update agent policy settings', error);
    } finally {
      dispatch({ payload: false, type: 'SET_IS_SAVING' });
    }
  }, [
    agentDailyCreditCap,
    allowAdvancedOverrides,
    autonomyDefault,
    brandDailyCreditCap,
    generationModelOverride,
    getOrganizationsService,
    organizationId,
    qualityTierDefault,
    refresh,
    reviewModelOverride,
    thinkingModelOverride,
  ]);

  const enabledModels = settings?.enabledModels ?? [];

  return (
    <div className="space-y-6">
      <AgentPolicyCard
        autonomyDefault={autonomyDefault}
        isSaving={isSaving}
        onAutonomyDefaultChange={(value) =>
          dispatch({ payload: value, type: 'SET_AUTONOMY_DEFAULT' })
        }
        onQualityTierDefaultChange={(value) =>
          dispatch({ payload: value, type: 'SET_QUALITY_TIER_DEFAULT' })
        }
        qualityTierDefault={qualityTierDefault}
        qualityTierOptions={QUALITY_TIER_OPTIONS}
      />

      <CreditGovernanceCard
        agentDailyCreditCap={agentDailyCreditCap}
        brandDailyCreditCap={brandDailyCreditCap}
        onAgentDailyCreditCapChange={(value) =>
          dispatch({ payload: value, type: 'SET_AGENT_DAILY_CREDIT_CAP' })
        }
        onBrandDailyCreditCapChange={(value) =>
          dispatch({ payload: value, type: 'SET_BRAND_DAILY_CREDIT_CAP' })
        }
      />

      <AdvancedRoutingCard
        allowAdvancedOverrides={allowAdvancedOverrides}
        enabledModels={enabledModels}
        generationModelOverride={generationModelOverride}
        isSaving={isSaving}
        onAllowAdvancedOverridesChange={(value) =>
          dispatch({ payload: value, type: 'SET_ALLOW_ADVANCED_OVERRIDES' })
        }
        onGenerationModelOverrideChange={(value) =>
          dispatch({ payload: value, type: 'SET_GENERATION_MODEL_OVERRIDE' })
        }
        onReviewModelOverrideChange={(value) =>
          dispatch({ payload: value, type: 'SET_REVIEW_MODEL_OVERRIDE' })
        }
        onThinkingModelOverrideChange={(value) =>
          dispatch({ payload: value, type: 'SET_THINKING_MODEL_OVERRIDE' })
        }
        reviewModelOverride={reviewModelOverride}
        thinkingModelOverride={thinkingModelOverride}
      />

      <Card className="p-6">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Brand-Level Profiles</h2>
          <p className="text-sm text-muted-foreground">
            Persona, voice, strategy, and platform overrides now live on each
            brand detail page instead of generic settings.
          </p>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button
          label="Save Agent Policy"
          onClick={handleSave}
          isLoading={isSaving}
          isDisabled={isSaving}
        />
      </div>
    </div>
  );
}
