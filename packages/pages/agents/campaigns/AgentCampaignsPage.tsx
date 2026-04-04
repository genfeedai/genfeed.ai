'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAgentCampaigns } from '@hooks/data/agent-campaigns/use-agent-campaigns';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import AppLink from '@ui/navigation/link/Link';
import { format, formatDistanceToNow } from 'date-fns';
import { useMemo } from 'react';
import {
  HiOutlineArrowRight,
  HiOutlineBolt,
  HiOutlineClock,
  HiOutlineCpuChip,
  HiOutlineCurrencyDollar,
  HiOutlinePlayCircle,
  HiOutlineRectangleGroup,
  HiPlus,
} from 'react-icons/hi2';

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

const STATUS_DOT_CLASSES: Record<CampaignStatus, string> = {
  active: 'bg-emerald-400 animate-pulse',
  completed: 'bg-emerald-400',
  draft: 'bg-zinc-400',
  paused: 'bg-amber-400',
};

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), 'MMM d, yyyy');
  } catch {
    logger.warn('Invalid date in AgentCampaignsPage', { date: dateStr });
    return '—';
  }
}

function formatRelativeTime(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
  } catch {
    return '—';
  }
}

/* ------------------------------------------------------------------ */
/*  KPI Stats Strip                                                    */
/* ------------------------------------------------------------------ */

interface StatItem {
  accent?: string;
  icon: React.ReactNode;
  label: string;
  value: string;
}

function CampaignStatsStrip({ campaigns }: { campaigns: AgentCampaign[] }) {
  const items: StatItem[] = useMemo(() => {
    const activeCampaigns = campaigns.filter((c) => c.status === 'active');
    const totalCreditsUsed = campaigns.reduce(
      (sum, c) => sum + c.creditsUsed,
      0,
    );
    const totalCreditsAllocated = campaigns.reduce(
      (sum, c) => sum + c.creditsAllocated,
      0,
    );

    const nextOrchestration = activeCampaigns
      .map((c) => c.nextOrchestratedAt)
      .filter(Boolean)
      .sort()
      .at(0);

    return [
      {
        accent: `${campaigns.length} total`,
        icon: <HiOutlinePlayCircle className="h-4 w-4 text-emerald-400" />,
        label: 'Active Campaigns',
        value: String(activeCampaigns.length),
      },
      {
        accent: `of ${totalCreditsAllocated.toLocaleString()} allocated`,
        icon: <HiOutlineCurrencyDollar className="h-4 w-4 text-purple-400" />,
        label: 'Total Credits Used',
        value: totalCreditsUsed.toLocaleString(),
      },
      {
        accent: `${Math.round(totalCreditsAllocated > 0 ? (totalCreditsUsed / totalCreditsAllocated) * 100 : 0)}% utilization`,
        icon: <HiOutlineBolt className="h-4 w-4 text-amber-400" />,
        label: 'Credits Allocated',
        value: totalCreditsAllocated.toLocaleString(),
      },
      {
        accent: nextOrchestration
          ? formatRelativeTime(nextOrchestration)
          : 'no scheduled runs',
        icon: <HiOutlineClock className="h-4 w-4 text-cyan-400" />,
        label: 'Next Orchestration',
        value: nextOrchestration ? formatDate(nextOrchestration) : '—',
      },
    ];
  }, [campaigns]);

  return (
    <section data-testid="campaign-stats-strip">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {items.map((item) => (
          <Card
            key={item.label}
            className="min-h-[100px] shadow-none"
            bodyClassName="p-4"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06]">
                {item.icon}
              </div>
              <div className="space-y-1">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-foreground/35">
                  {item.label}
                </p>
                <div className="text-2xl font-semibold tracking-[-0.03em] text-foreground">
                  {item.value}
                </div>
              </div>
            </div>
            {item.accent ? (
              <p className="mt-1 text-xs text-foreground/45">{item.accent}</p>
            ) : null}
          </Card>
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Active Campaign Cards                                              */
/* ------------------------------------------------------------------ */

function CampaignCard({ campaign }: { campaign: AgentCampaign }) {
  const creditsPercent =
    campaign.creditsAllocated > 0
      ? Math.min(
          100,
          Math.round((campaign.creditsUsed / campaign.creditsAllocated) * 100),
        )
      : 0;

  return (
    <div className="group relative flex flex-col gap-3 rounded-lg border border-white/[0.08] bg-white/[0.02] p-4 transition-colors hover:border-white/[0.14] hover:bg-white/[0.04]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06]">
            <HiOutlineCpuChip className="h-4 w-4 text-foreground/60" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {campaign.label}
            </p>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'inline-block h-1.5 w-1.5 rounded-full',
                  STATUS_DOT_CLASSES[campaign.status],
                )}
              />
              <span className="text-[11px] text-foreground/45">
                {campaign.status}
              </span>
            </div>
          </div>
        </div>
        <AppLink
          url={`/orchestration/campaigns/${campaign.id}`}
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          icon={<HiOutlineArrowRight className="h-3.5 w-3.5" />}
          label=""
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </div>

      {campaign.brief && (
        <div className="min-h-[40px] rounded border border-white/[0.06] bg-black/40 px-3 py-2">
          <p className="line-clamp-2 text-[11px] text-foreground/40 leading-relaxed">
            {campaign.brief}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-foreground/50">
        <span>
          {campaign.agents.length} agent
          {campaign.agents.length !== 1 ? 's' : ''}
        </span>
        <span>
          {campaign.creditsUsed.toLocaleString()} /{' '}
          {campaign.creditsAllocated.toLocaleString()} credits
        </span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-emerald-500/60 transition-all"
          style={{ width: `${creditsPercent}%` }}
        />
      </div>

      {campaign.nextOrchestratedAt && (
        <p className="text-[10px] text-foreground/30">
          Next run {formatRelativeTime(campaign.nextOrchestratedAt)}
        </p>
      )}
    </div>
  );
}

function ActiveCampaignCards({ campaigns }: { campaigns: AgentCampaign[] }) {
  const activeCampaigns = useMemo(
    () => campaigns.filter((c) => c.status === 'active').slice(0, 3),
    [campaigns],
  );

  if (activeCampaigns.length === 0) {
    return null;
  }

  return (
    <section data-testid="campaign-active-cards">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
          Active Campaigns
        </h2>
        {campaigns.filter((c) => c.status === 'active').length > 3 && (
          <AppLink
            url="/orchestration/campaigns"
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.XS}
            label="View All"
          />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {activeCampaigns.map((campaign) => (
          <CampaignCard key={campaign.id} campaign={campaign} />
        ))}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Enhanced Campaign Table                                            */
/* ------------------------------------------------------------------ */

function ProgressBar({ allocated, used }: { allocated: number; used: number }) {
  const percent =
    allocated > 0 ? Math.min(100, Math.round((used / allocated) * 100)) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-emerald-500/60 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs text-foreground/50">{percent}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AgentCampaignsPage() {
  const { campaigns, isLoading } = useAgentCampaigns();

  const columns = useMemo(
    () => [
      {
        header: 'Campaign',
        key: 'label',
        render: (campaign: AgentCampaign) => (
          <div className="flex flex-col">
            <span className="font-medium">{campaign.label}</span>
            {campaign.brief && (
              <span className="text-xs text-foreground/50 line-clamp-1">
                {campaign.brief}
              </span>
            )}
          </div>
        ),
      },
      {
        header: 'Status',
        key: 'status',
        render: (campaign: AgentCampaign) => (
          <Badge variant={STATUS_BADGE_VARIANTS[campaign.status]}>
            {campaign.status}
          </Badge>
        ),
      },
      {
        header: 'Agents',
        key: 'agents',
        render: (campaign: AgentCampaign) => (
          <span className="text-sm">{campaign.agents.length}</span>
        ),
      },
      {
        header: 'Orchestration',
        key: 'orchestration',
        render: (campaign: AgentCampaign) => (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'inline-block h-1.5 w-1.5 rounded-full',
                campaign.orchestrationEnabled
                  ? 'bg-emerald-400'
                  : 'bg-zinc-500',
              )}
            />
            <span className="text-sm text-foreground/70">
              {campaign.orchestrationEnabled
                ? `Every ${campaign.orchestrationIntervalHours ?? 24}h`
                : 'Off'}
            </span>
          </div>
        ),
      },
      {
        header: 'Progress',
        key: 'progress',
        render: (campaign: AgentCampaign) => (
          <ProgressBar
            allocated={campaign.creditsAllocated}
            used={campaign.creditsUsed}
          />
        ),
      },
      {
        header: 'Start Date',
        key: 'startDate',
        render: (campaign: AgentCampaign) => (
          <span className="text-sm">{formatDate(campaign.startDate)}</span>
        ),
      },
    ],
    [],
  );

  const hasCampaigns = campaigns.length > 0;

  return (
    <Container
      label="Agent Campaigns"
      description="Coordinated multi-agent content production."
      icon={HiOutlineRectangleGroup}
      right={
        <AppLink
          url="/orchestration/campaigns/new"
          variant={ButtonVariant.DEFAULT}
          size={ButtonSize.SM}
          label={
            <>
              <HiPlus /> New Campaign
            </>
          }
        />
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-foreground/40">
          Loading campaigns...
        </div>
      ) : hasCampaigns ? (
        <div className="space-y-8">
          <CampaignStatsStrip campaigns={campaigns} />
          <ActiveCampaignCards campaigns={campaigns} />
          <section data-testid="campaign-table">
            <div className="mb-4">
              <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-foreground/35">
                All Campaigns
              </h2>
            </div>
            <AppTable<AgentCampaign>
              items={campaigns}
              columns={columns}
              isLoading={false}
              getRowKey={(campaign) => campaign.id}
              emptyLabel="No campaigns yet."
            />
          </section>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.02]">
            <HiOutlineRectangleGroup className="h-6 w-6 text-foreground/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/60">
              No campaigns yet
            </p>
            <p className="mt-1 text-xs text-foreground/35">
              Create your first multi-agent campaign to coordinate content
              production.
            </p>
          </div>
          <AppLink
            url="/orchestration/campaigns/new"
            variant={ButtonVariant.DEFAULT}
            size={ButtonSize.SM}
            label={
              <>
                <HiPlus /> New Campaign
              </>
            }
          />
        </div>
      )}
    </Container>
  );
}
