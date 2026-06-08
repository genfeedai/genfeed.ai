'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { IAgentCampaignStatusResponse } from '@genfeedai/interfaces';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import Badge from '@ui/display/badge/Badge';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import { Button } from '@ui/primitives/button';
import { HiArrowLeft } from 'react-icons/hi2';

type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed';

const STATUS_BADGE_VARIANTS: Record<
  CampaignStatus,
  'secondary' | 'success' | 'warning' | 'default'
> = {
  active: 'success',
  completed: 'default',
  draft: 'secondary',
  paused: 'warning',
};

type Props = {
  campaign: AgentCampaign;
  creditsPercent: number;
  onBack: () => void;
  status: IAgentCampaignStatusResponse | null;
};

export default function AgentCampaignDetailHeader({
  campaign,
  creditsPercent,
  onBack,
  status,
}: Props) {
  return (
    <>
      <div className="flex items-center gap-4">
        <Button
          label={<HiArrowLeft />}
          variant={ButtonVariant.SECONDARY}
          onClick={onBack}
          size={ButtonSize.SM}
        />
        <Badge variant={STATUS_BADGE_VARIANTS[campaign.status]}>
          {campaign.status}
        </Badge>
      </div>

      <KPISection
        title="Campaign Overview"
        gridCols={{ desktop: 4, mobile: 2, tablet: 2 }}
        items={[
          {
            description: 'Active agent strategies',
            label: 'Agents Running',
            value: status?.agentsRunning ?? 0,
          },
          {
            description: 'Total content items produced',
            label: 'Content Produced',
            value: status?.contentProduced ?? 0,
          },
          {
            description: `${creditsPercent}% of allocated`,
            label: 'Credits Used',
            value: campaign.creditsUsed.toLocaleString(),
          },
          {
            description: 'Budget cap',
            label: 'Credits Allocated',
            value: campaign.creditsAllocated.toLocaleString(),
          },
        ]}
      />
    </>
  );
}
