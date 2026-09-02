'use client';

import { AgentAutonomyMode } from '@genfeedai/contracts';
import type { IOrganizationSetting } from '@genfeedai/contracts/interfaces';
import Card from '@ui/card/Card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives';

type AgentPolicyState = NonNullable<IOrganizationSetting['agentPolicy']>;

type QualityTierOption = {
  description: string;
  label: string;
  value: NonNullable<AgentPolicyState['qualityTierDefault']>;
};

type AgentPolicyCardProps = {
  autonomyDefault: AgentAutonomyMode;
  isSaving: boolean;
  onAutonomyDefaultChange: (value: AgentAutonomyMode) => void;
  onQualityTierDefaultChange: (
    value: NonNullable<AgentPolicyState['qualityTierDefault']>,
  ) => void;
  qualityTierDefault: NonNullable<AgentPolicyState['qualityTierDefault']>;
  qualityTierOptions: QualityTierOption[];
};

export default function AgentPolicyCard({
  autonomyDefault,
  isSaving,
  onAutonomyDefaultChange,
  onQualityTierDefaultChange,
  qualityTierDefault,
  qualityTierOptions,
}: AgentPolicyCardProps) {
  return (
    <Card label="Autonomous Agent Policy" bodyClassName="gap-3 p-4">
      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium">Default Quality Tier</p>
          <Select
            value={qualityTierDefault}
            disabled={isSaving}
            onValueChange={(value) =>
              onQualityTierDefaultChange(
                value as NonNullable<AgentPolicyState['qualityTierDefault']>,
              )
            }
          >
            <SelectTrigger className="w-full mt-2 rounded">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {qualityTierOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-2 text-xs text-muted-foreground">
            {
              qualityTierOptions.find(
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
              onAutonomyDefaultChange(value as AgentAutonomyMode)
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
  );
}
