'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { SurfaceSummaryItem } from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { DATE_FORMATS } from '@helpers/formatting/date/date.helper';
import { useAgentCampaigns } from '@hooks/data/agent-campaigns/use-agent-campaigns';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import { SurfaceSummaryStrip } from '@ui/dashboard/SurfaceSummaryStrip';
import Badge from '@ui/display/badge/Badge';
import AppTable from '@ui/display/table/Table';
import Container from '@ui/layout/container/Container';
import { Button } from '@ui/primitives/button';
import { format, formatDistanceToNow } from 'date-fns';
import {
  ArrowRight,
  CirclePlay,
  Clock,
  Cpu,
  DollarSign,
  LayoutDashboard,
  Plus,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo } from 'react';

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

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), DATE_FORMATS.DISPLAY_DATE);
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

function CampaignStatsStrip({ campaigns }: { campaigns: AgentCampaign[] }) {
  const items: SurfaceSummaryItem[] = useMemo(() => {
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
      .flatMap((c) => (c.nextOrchestratedAt ? [c.nextOrchestratedAt] : []))
      .sort()
      .at(0);

    return [
      {
        accent: `${campaigns.length} total`,
        icon: <CirclePlay className="size-4 text-muted-foreground" />,
        label: 'Active Programs',
        value: String(activeCampaigns.length),
      },
      {
        accent: `of ${totalCreditsAllocated.toLocaleString()} allocated`,
        icon: <DollarSign className="size-4 text-muted-foreground" />,
        label: 'Total Credits Used',
        value: totalCreditsUsed.toLocaleString(),
      },
      {
        accent: `${Math.round(totalCreditsAllocated > 0 ? (totalCreditsUsed / totalCreditsAllocated) * 100 : 0)}% utilization`,
        icon: <Zap className="size-4 text-muted-foreground" />,
        label: 'Credits Allocated',
        value: totalCreditsAllocated.toLocaleString(),
      },
      {
        accent: nextOrchestration
          ? formatRelativeTime(nextOrchestration)
          : 'no scheduled runs',
        icon: <Clock className="size-4 text-muted-foreground" />,
        label: 'Next Orchestration',
        value: nextOrchestration ? formatDate(nextOrchestration) : '—',
      },
    ];
  }, [campaigns]);

  return <SurfaceSummaryStrip items={items} testId="campaign-stats-strip" />;
}

/* ------------------------------------------------------------------ */
/*  Active Campaign Cards                                              */
/* ------------------------------------------------------------------ */

function CampaignCard({ campaign }: { campaign: AgentCampaign }) {
  const { href } = useOrgUrl();
  const creditsPercent =
    campaign.creditsAllocated > 0
      ? Math.min(
          100,
          Math.round((campaign.creditsUsed / campaign.creditsAllocated) * 100),
        )
      : 0;

  return (
    <Card className="group" bodyClassName="gap-3 p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-full border border-border bg-foreground/[0.06]">
            <Cpu className="size-4 text-foreground/60" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {campaign.label}
            </p>
            <Badge status={campaign.status} size={ComponentSize.SM}>
              {campaign.status}
            </Badge>
          </div>
        </div>
        <Button
          asChild
          variant={ButtonVariant.GHOST}
          size={ButtonSize.XS}
          className="opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Link
            href={href(`${APP_ROUTES.AUTOMATION.CAMPAIGNS}/${campaign.id}`)}
            aria-label={`Open ${campaign.label}`}
          >
            <ArrowRight className="size-3.5" />
          </Link>
        </Button>
      </div>

      {campaign.brief && (
        <div className="min-h-[40px] rounded bg-secondary px-3 py-2">
          <p className="line-clamp-2 text-2xs text-foreground/40 leading-relaxed">
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

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full bg-foreground/60 transition-all"
          style={{ width: `${creditsPercent}%` }}
        />
      </div>

      {campaign.nextOrchestratedAt && (
        <p className="text-2xs text-foreground/30">
          Next run {formatRelativeTime(campaign.nextOrchestratedAt)}
        </p>
      )}
    </Card>
  );
}

function ActiveCampaignCards({ campaigns }: { campaigns: AgentCampaign[] }) {
  const { href } = useOrgUrl();
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
        <h2 className="text-2xs font-bold uppercase tracking-[0.2em] text-foreground/35">
          Active Programs
        </h2>
        {campaigns.filter((c) => c.status === 'active').length > 3 && (
          <Button
            asChild
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.XS}
          >
            <Link href={href(APP_ROUTES.AUTOMATION.CAMPAIGNS)}>View All</Link>
          </Button>
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
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-foreground/[0.06]">
        <div
          className="h-full rounded-full bg-foreground/60 transition-all"
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
  const { href } = useOrgUrl();

  const columns = useMemo(
    () => [
      {
        header: 'Program',
        key: 'label',
        render: (campaign: AgentCampaign) => (
          <div className="flex flex-col">
            <Link
              className="font-medium hover:underline"
              href={href(`${APP_ROUTES.AUTOMATION.CAMPAIGNS}/${campaign.id}`)}
            >
              {campaign.label}
            </Link>
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
                  ? 'bg-success'
                  : 'bg-muted-foreground',
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
    [href],
  );

  const hasCampaigns = campaigns.length > 0;

  return (
    <Container
      label="Programs"
      description="Coordinate agents for multi-agent content production."
      icon={LayoutDashboard}
      right={
        <Button asChild variant={ButtonVariant.DEFAULT} size={ButtonSize.SM}>
          <Link href={href(APP_ROUTES.AUTOMATION.CAMPAIGNS_NEW)}>
            <Plus /> New Program
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-sm text-foreground/40">
          Loading programs…
        </div>
      ) : hasCampaigns ? (
        <div className="space-y-8">
          <CampaignStatsStrip campaigns={campaigns} />
          <ActiveCampaignCards campaigns={campaigns} />
          <section data-testid="campaign-table">
            <div className="mb-4">
              <h2 className="text-2xs font-bold uppercase tracking-[0.2em] text-foreground/35">
                All Programs
              </h2>
            </div>
            <AppTable<AgentCampaign>
              items={campaigns}
              columns={columns}
              isLoading={false}
              getRowKey={(campaign) => campaign.id}
              emptyLabel="No programs yet."
            />
          </section>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex size-12 items-center justify-center rounded-full border border-border bg-foreground/[0.02]">
            <LayoutDashboard className="size-6 text-foreground/30" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-foreground/60">
              No programs yet
            </p>
            <p className="mt-1 text-xs text-foreground/35">
              Create your first multi-agent program to coordinate content
              production.
            </p>
          </div>
          <Button asChild variant={ButtonVariant.DEFAULT} size={ButtonSize.SM}>
            <Link href={href(APP_ROUTES.AUTOMATION.CAMPAIGNS_NEW)}>
              <Plus /> New Program
            </Link>
          </Button>
        </div>
      )}
    </Container>
  );
}
