'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import type { AgentStrategy } from '@services/automation/agent-strategies.service';
import Card from '@ui/card/Card';
import { Button as PrimitiveButton } from '@ui/primitives/button';
import Link from 'next/link';
import { HiOutlineRectangleGroup } from 'react-icons/hi2';

function resolveCampaignLeadLabel(
  campaign: AgentCampaign,
  strategiesById: Map<string, AgentStrategy>,
): string {
  if (!campaign.campaignLeadStrategyId) {
    return 'Not assigned';
  }

  const strategy = strategiesById.get(campaign.campaignLeadStrategyId);
  return strategy?.label ?? strategy?.displayRole ?? 'Unknown lead';
}

function resolveApprovalPolicy(
  campaign: AgentCampaign,
  strategiesById: Map<string, AgentStrategy>,
): string {
  const linkedStrategies = campaign.agents.reduce<AgentStrategy[]>(
    (strategies, agentId) => {
      const strategy = strategiesById.get(agentId);
      if (strategy) {
        strategies.push(strategy);
      }
      return strategies;
    },
    [],
  );

  if (linkedStrategies.length === 0) {
    return 'Manual review';
  }

  return linkedStrategies.some(
    (strategy) => strategy.autonomyMode !== 'autopilot',
  )
    ? 'Manual review'
    : 'Autonomous publish';
}

type Props = {
  campaigns: AgentCampaign[];
  isCampaignsLoading: boolean;
  strategiesById: Map<string, AgentStrategy>;
};

export default function ContentTeamCampaignsSection({
  campaigns,
  isCampaignsLoading,
  strategiesById,
}: Props) {
  return (
    <section className="mt-10 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-[-0.02em] text-foreground">
            Campaigns
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Orchestrator-level initiatives coordinating multiple specialists
            around one objective.
          </p>
        </div>
        <PrimitiveButton
          asChild
          variant={ButtonVariant.SECONDARY}
          size={ButtonSize.SM}
        >
          <Link href="/orchestration/orchestrator">Launch Orchestrator</Link>
        </PrimitiveButton>
      </div>

      {isCampaignsLoading ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {['campaign-skeleton-1', 'campaign-skeleton-2'].map((skeletonId) => (
            <div
              key={skeletonId}
              className="h-48 animate-pulse rounded-[1.25rem] border border-white/[0.08] bg-white/[0.04]"
            />
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card
          bodyClassName="flex flex-col items-start gap-4 p-6"
          description="Create a main orchestrator campaign to coordinate goals, budgets, and active specialists."
          icon={HiOutlineRectangleGroup}
          iconWrapperClassName="bg-indigo-500/12 text-indigo-300"
          label="No orchestrators launched yet"
        >
          <PrimitiveButton
            asChild
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
          >
            <Link href="/orchestration/orchestrator">Set Up Campaign Lead</Link>
          </PrimitiveButton>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {campaigns.map((campaign) => (
            <Card
              key={campaign.id}
              bodyClassName="space-y-5 p-4"
              description={
                campaign.brief ?? 'Coordinated multi-agent initiative.'
              }
              headerAction={
                <span className="inline-flex rounded-full bg-blue-500/12 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                  {campaign.status}
                </span>
              }
              label={campaign.label}
            >
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-foreground/45">Campaign Lead</p>
                  <p className="mt-1 font-medium text-foreground">
                    {resolveCampaignLeadLabel(campaign, strategiesById)}
                  </p>
                </div>
                <div>
                  <p className="text-foreground/45">Active Agents</p>
                  <p className="mt-1 font-medium text-foreground">
                    {campaign.agents.length}
                  </p>
                </div>
                <div>
                  <p className="text-foreground/45">Quota</p>
                  <p className="mt-1 font-medium text-foreground">
                    {campaign.contentQuota
                      ? `${campaign.contentQuota.posts ?? 0} posts / ${campaign.contentQuota.images ?? 0} images / ${campaign.contentQuota.videos ?? 0} videos`
                      : 'Open'}
                  </p>
                </div>
                <div>
                  <p className="text-foreground/45">Approval Policy</p>
                  <p className="mt-1 font-medium text-foreground">
                    {resolveApprovalPolicy(campaign, strategiesById)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.08] pt-4">
                <PrimitiveButton
                  asChild
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                >
                  <Link href="/orchestration/campaigns">Open Campaigns</Link>
                </PrimitiveButton>
                <PrimitiveButton
                  asChild
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                >
                  <Link href="/orchestration/orchestrator">
                    Adjust Orchestrator
                  </Link>
                </PrimitiveButton>
              </div>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
