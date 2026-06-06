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
import { useCallback, useEffect, useState } from 'react';

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

export default function SettingsAgentsPage() {
  const { organizationId } = useBrand();
  const { refresh, settings } = useOrganization();
  const [qualityTierDefault, setQualityTierDefault] =
    useState<NonNullable<AgentPolicyState['qualityTierDefault']>>('balanced');
  const [autonomyDefault, setAutonomyDefault] = useState(
    AgentAutonomyMode.SUPERVISED,
  );
  const [brandDailyCreditCap, setBrandDailyCreditCap] = useState('');
  const [agentDailyCreditCap, setAgentDailyCreditCap] = useState('');
  const [allowAdvancedOverrides, setAllowAdvancedOverrides] = useState(false);
  const [thinkingModelOverride, setThinkingModelOverride] = useState('');
  const [generationModelOverride, setGenerationModelOverride] = useState('');
  const [reviewModelOverride, setReviewModelOverride] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const getOrganizationsService = useAuthedService((token: string) =>
    OrganizationsService.getInstance(token),
  );

  useEffect(() => {
    const agentPolicy = settings?.agentPolicy;
    setQualityTierDefault(agentPolicy?.qualityTierDefault ?? 'balanced');
    setAutonomyDefault(
      (agentPolicy?.autonomyDefault as AgentAutonomyMode | undefined) ??
        AgentAutonomyMode.SUPERVISED,
    );
    setBrandDailyCreditCap(
      agentPolicy?.creditGovernance?.brandDailyCreditCap?.toString() ?? '',
    );
    setAgentDailyCreditCap(
      agentPolicy?.creditGovernance?.agentDailyCreditCap?.toString() ?? '',
    );
    setAllowAdvancedOverrides(agentPolicy?.allowAdvancedOverrides ?? false);
    setThinkingModelOverride(agentPolicy?.thinkingModelOverride ?? '');
    setGenerationModelOverride(agentPolicy?.generationModelOverride ?? '');
    setReviewModelOverride(agentPolicy?.reviewModelOverride ?? '');
  }, [settings?.agentPolicy]);

  const handleSave = useCallback(async () => {
    if (!organizationId) {
      return;
    }

    setIsSaving(true);
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
      setIsSaving(false);
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
        onAutonomyDefaultChange={setAutonomyDefault}
        onQualityTierDefaultChange={setQualityTierDefault}
        qualityTierDefault={qualityTierDefault}
        qualityTierOptions={QUALITY_TIER_OPTIONS}
      />

      <CreditGovernanceCard
        agentDailyCreditCap={agentDailyCreditCap}
        brandDailyCreditCap={brandDailyCreditCap}
        onAgentDailyCreditCapChange={setAgentDailyCreditCap}
        onBrandDailyCreditCapChange={setBrandDailyCreditCap}
      />

      <AdvancedRoutingCard
        allowAdvancedOverrides={allowAdvancedOverrides}
        enabledModels={enabledModels}
        generationModelOverride={generationModelOverride}
        isSaving={isSaving}
        onAllowAdvancedOverridesChange={setAllowAdvancedOverrides}
        onGenerationModelOverrideChange={setGenerationModelOverride}
        onReviewModelOverrideChange={setReviewModelOverride}
        onThinkingModelOverrideChange={setThinkingModelOverride}
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
