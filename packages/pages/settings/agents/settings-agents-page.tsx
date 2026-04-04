'use client';

import type { IOrganizationSetting } from '@cloud/interfaces';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { AgentAutonomyMode } from '@genfeedai/enums';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrganization } from '@hooks/data/organization/use-organization/use-organization';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import FormToggle from '@ui/forms/selectors/toggle/form-toggle/FormToggle';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives';
import { Input } from '@ui/primitives/input';
import { useCallback, useEffect, useState } from 'react';

type AgentPolicyState = NonNullable<IOrganizationSetting['agentPolicy']>;

const AUTO_MODEL_SELECT_VALUE = '__auto__';
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
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Autonomous Agent Policy</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium">Default Quality Tier</p>
            <Select
              value={qualityTierDefault}
              disabled={isSaving}
              onValueChange={(value) =>
                setQualityTierDefault(
                  value as NonNullable<AgentPolicyState['qualityTierDefault']>,
                )
              }
            >
              <SelectTrigger className="w-full mt-2 rounded">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {QUALITY_TIER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-2 text-xs text-muted-foreground">
              {
                QUALITY_TIER_OPTIONS.find(
                  (option) => option.value === qualityTierDefault,
                )?.description
              }
            </p>
          </div>

          <div>
            <p className="text-sm font-medium">Default Autonomy Mode</p>
            <Select
              value={autonomyDefault}
              disabled={isSaving}
              onValueChange={(value) =>
                setAutonomyDefault(value as AgentAutonomyMode)
              }
            >
              <SelectTrigger className="w-full mt-2 rounded">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={AgentAutonomyMode.SUPERVISED}>
                  Generate then Review
                </SelectItem>
                <SelectItem value={AgentAutonomyMode.AUTO_PUBLISH}>
                  Auto-Publish
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Credit Governance</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="brand-daily-credit-cap"
              className="text-sm font-medium"
            >
              Brand Daily Cap
            </label>
            <Input
              id="brand-daily-credit-cap"
              className="mt-2"
              type="number"
              min={0}
              placeholder="Optional"
              value={brandDailyCreditCap}
              onChange={(event) => setBrandDailyCreditCap(event.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Optional pooled-credit cap applied per brand across all agents.
            </p>
          </div>

          <div>
            <label
              htmlFor="agent-daily-credit-cap"
              className="text-sm font-medium"
            >
              Agent Daily Cap
            </label>
            <Input
              id="agent-daily-credit-cap"
              className="mt-2"
              type="number"
              min={0}
              placeholder="Optional"
              value={agentDailyCreditCap}
              onChange={(event) => setAgentDailyCreditCap(event.target.value)}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              Hard ceiling enforced per strategy against the org pool.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Advanced Routing</h2>
        <div className="space-y-4">
          <FormToggle
            label="Expose Raw Model Overrides"
            description="Enable explicit planner, generation, and review model routing controls for advanced operators."
            isChecked={allowAdvancedOverrides}
            isDisabled={isSaving}
            onChange={(event) =>
              setAllowAdvancedOverrides(event.target.checked)
            }
          />

          {allowAdvancedOverrides ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium">Thinking Model</p>
                <Select
                  value={thinkingModelOverride || AUTO_MODEL_SELECT_VALUE}
                  onValueChange={(value) =>
                    setThinkingModelOverride(
                      value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                    )
                  }
                >
                  <SelectTrigger className="w-full mt-2 rounded">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                      Auto
                    </SelectItem>
                    {enabledModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-sm font-medium">Generation Model</p>
                <Select
                  value={generationModelOverride || AUTO_MODEL_SELECT_VALUE}
                  onValueChange={(value) =>
                    setGenerationModelOverride(
                      value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                    )
                  }
                >
                  <SelectTrigger className="w-full mt-2 rounded">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                      Auto
                    </SelectItem>
                    {enabledModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="text-sm font-medium">Review Model</p>
                <Select
                  value={reviewModelOverride || AUTO_MODEL_SELECT_VALUE}
                  onValueChange={(value) =>
                    setReviewModelOverride(
                      value === AUTO_MODEL_SELECT_VALUE ? '' : value,
                    )
                  }
                >
                  <SelectTrigger className="w-full mt-2 rounded">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={AUTO_MODEL_SELECT_VALUE}>
                      Auto
                    </SelectItem>
                    {enabledModels.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Keep this off for most teams. Budget / Balanced / High Quality is
              the default control surface.
            </p>
          )}
        </div>
      </Card>

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
