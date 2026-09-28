'use client';

import {
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { SurfaceSummaryItem } from '@genfeedai/contracts/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { DATE_FORMATS } from '@helpers/formatting/date/date.helper';
import { useAgentCampaigns } from '@hooks/data/agent-campaigns/use-agent-campaigns';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useCollectionViewPreference } from '@hooks/utils/use-collection-view-preference/use-collection-view-preference';
import type {
  AgentCampaignItemProps,
  AgentCampaignProgressProps,
  AgentCampaignRelativeTimeTranslate,
} from '@props/automation/agent-campaigns-page.props';
import type { AgentCampaign } from '@services/automation/agent-campaigns.service';
import { logger } from '@services/core/logger.service';
import Card from '@ui/card/Card';
import CollectionItemActions from '@ui/collection/CollectionItemActions';
import CollectionList from '@ui/collection/CollectionList';
import CollectionSection from '@ui/collection/CollectionSection';
import CollectionToolbar from '@ui/collection/CollectionToolbar';
import CollectionView from '@ui/collection/CollectionView';
import { SurfaceSummaryStrip } from '@ui/dashboard/SurfaceSummaryStrip';
import Badge from '@ui/display/badge/Badge';
import Container from '@ui/layout/container/Container';
import { ListRow } from '@ui/lists/list-row/ListRow';
import { Button } from '@ui/primitives/button';
import { format } from 'date-fns';
import {
  CirclePlay,
  Clock,
  DollarSign,
  LayoutDashboard,
  Plus,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

const CAMPAIGNS_COLLECTION_SURFACE = 'automation.campaigns';

function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—';
  try {
    return format(new Date(dateStr), DATE_FORMATS.DISPLAY_DATE);
  } catch {
    logger.warn('Invalid date in AgentCampaignsPage', { date: dateStr });
    return '—';
  }
}

/** Past times read "3h ago", scheduled ones "in 3h". Pass a
 * `common.agentCampaign.relativeTime`-scoped translate. */
function formatRelativeTime(
  dateStr: string,
  translate: AgentCampaignRelativeTimeTranslate,
): string {
  const time = new Date(dateStr).getTime();
  if (Number.isNaN(time)) {
    logger.warn('Invalid date in AgentCampaignsPage', { date: dateStr });
    return '—';
  }

  const deltaMinutes = Math.floor(Math.abs(Date.now() - time) / 60_000);
  const isFuture = time > Date.now();

  if (deltaMinutes < 1) {
    return translate(isFuture ? 'dueNow' : 'justNow');
  }
  if (deltaMinutes < 60) {
    return translate(isFuture ? 'inMinutes' : 'minutesAgo', {
      minutes: deltaMinutes,
    });
  }

  const hours = Math.floor(deltaMinutes / 60);
  if (hours < 24) {
    return translate(isFuture ? 'inHours' : 'hoursAgo', { hours });
  }

  return translate(isFuture ? 'inDays' : 'daysAgo', {
    days: Math.floor(hours / 24),
  });
}

function getCreditsPercent(allocated: number, used: number): number {
  return allocated > 0
    ? Math.min(100, Math.round((used / allocated) * 100))
    : 0;
}

/**
 * A Program needs the operator when it is paused, or when it is still active
 * but has spent its whole credit allocation. Programs carry no failure state,
 * so those are the only attention signals the list data has.
 */
function isCampaignNeedingAttention(campaign: AgentCampaign): boolean {
  if (campaign.status === 'paused') {
    return true;
  }

  return (
    campaign.status === 'active' &&
    campaign.creditsAllocated > 0 &&
    campaign.creditsUsed >= campaign.creditsAllocated
  );
}

/* ------------------------------------------------------------------ */
/*  KPI Stats Strip                                                    */
/* ------------------------------------------------------------------ */

function CampaignStatsStrip({ campaigns }: { campaigns: AgentCampaign[] }) {
  const translateTime = useTranslations('common.agentCampaign.relativeTime');
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
          ? formatRelativeTime(nextOrchestration, translateTime)
          : 'no scheduled runs',
        icon: <Clock className="size-4 text-muted-foreground" />,
        label: 'Next Orchestration',
        value: nextOrchestration ? formatDate(nextOrchestration) : '—',
      },
    ];
  }, [campaigns, translateTime]);

  return <SurfaceSummaryStrip items={items} testId="campaign-stats-strip" />;
}

/* ------------------------------------------------------------------ */
/*  Program anatomy: status, progress, one fact line, one action       */
/* ------------------------------------------------------------------ */

function CampaignProgress({
  allocated,
  used,
  className,
}: AgentCampaignProgressProps) {
  const translate = useTranslations('common.agentCampaign.collection');
  const percent = getCreditsPercent(allocated, used);

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div
        aria-label={translate('creditsProgress', { percent })}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        className="h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-foreground/[0.06]"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-foreground/60 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}

function useCampaignFacts(campaign: AgentCampaign): string {
  const translate = useTranslations('common.agentCampaign.collection');
  const translateTime = useTranslations('common.agentCampaign.relativeTime');
  const facts = [
    translate('credits', {
      allocated: campaign.creditsAllocated.toLocaleString(),
      used: campaign.creditsUsed.toLocaleString(),
    }),
    translate('agents', { count: campaign.agents.length }),
    campaign.lastOrchestratedAt
      ? translate('lastRun', {
          time: formatRelativeTime(campaign.lastOrchestratedAt, translateTime),
        })
      : null,
  ];

  return facts.filter(Boolean).join(' · ');
}

function CampaignStatusBadge({ campaign }: AgentCampaignItemProps) {
  const translate = useTranslations('common.agentCampaign.status');

  return (
    <Badge status={campaign.status} size={ComponentSize.SM}>
      {translate(campaign.status)}
    </Badge>
  );
}

function CampaignActions({
  campaign,
  isNeedsYou = false,
}: AgentCampaignItemProps) {
  const translate = useTranslations('common.agentCampaign.collection');
  const { href } = useOrgUrl();

  return (
    <CollectionItemActions
      primary={
        <Button
          asChild
          size={ButtonSize.XS}
          variant={isNeedsYou ? ButtonVariant.DEFAULT : ButtonVariant.SECONDARY}
        >
          <Link
            aria-label={translate(isNeedsYou ? 'reviewLabel' : 'openLabel', {
              label: campaign.label,
            })}
            href={href(`${APP_ROUTES.AUTOMATION.CAMPAIGNS}/${campaign.id}`)}
          >
            {translate(isNeedsYou ? 'review' : 'open')}
          </Link>
        </Button>
      }
    />
  );
}

function CampaignRow({ campaign, isNeedsYou = false }: AgentCampaignItemProps) {
  const facts = useCampaignFacts(campaign);

  return (
    <ListRow
      data-testid="campaign-row"
      density="compact"
      meta={
        <>
          <CampaignStatusBadge campaign={campaign} />
          <span className="truncate">{facts}</span>
        </>
      }
      title={campaign.label}
      trailing={
        <div className="flex items-center gap-4">
          <CampaignProgress
            allocated={campaign.creditsAllocated}
            className="hidden w-32 sm:flex"
            used={campaign.creditsUsed}
          />
          <CampaignActions campaign={campaign} isNeedsYou={isNeedsYou} />
        </div>
      }
    />
  );
}

function CampaignCard({ campaign }: AgentCampaignItemProps) {
  const facts = useCampaignFacts(campaign);

  return (
    <Card bodyClassName="gap-3 p-4" data-testid="campaign-card">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CampaignStatusBadge campaign={campaign} />
          <p className="truncate text-sm font-semibold text-foreground">
            {campaign.label}
          </p>
        </div>
        <CampaignActions campaign={campaign} />
      </div>

      {campaign.brief ? (
        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {campaign.brief}
        </p>
      ) : null}

      <CampaignProgress
        allocated={campaign.creditsAllocated}
        used={campaign.creditsUsed}
      />

      <p className="truncate text-xs text-muted-foreground">{facts}</p>
    </Card>
  );
}

function renderCampaignRow(campaign: AgentCampaign) {
  return <CampaignRow campaign={campaign} />;
}

function renderCampaignCard(campaign: AgentCampaign) {
  return <CampaignCard campaign={campaign} />;
}

function getCampaignKey(campaign: AgentCampaign): string {
  return campaign.id;
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AgentCampaignsPage() {
  const translate = useTranslations('common.agentCampaign.collection');
  const { campaigns, error, isLoading, refresh } = useAgentCampaigns();
  const { href } = useOrgUrl();
  const { view, setView } = useCollectionViewPreference({
    defaultView: ViewType.LIST,
    surface: CAMPAIGNS_COLLECTION_SURFACE,
  });

  const needsYouCampaigns = useMemo(
    () => campaigns.filter(isCampaignNeedingAttention),
    [campaigns],
  );

  const hasCampaigns = campaigns.length > 0;
  // A failed refetch keeps showing the Programs already loaded; only a
  // failure with nothing to show replaces the collection with the error.
  const hasLoadError = error !== null && !isLoading && !hasCampaigns;
  const isEmpty = !isLoading && !hasLoadError && !hasCampaigns;

  return (
    <Container
      label="Programs"
      description="Coordinate agents for multi-agent content production."
      icon={LayoutDashboard}
      right={
        isEmpty ? undefined : (
          <Button asChild variant={ButtonVariant.DEFAULT} size={ButtonSize.SM}>
            <Link href={href(APP_ROUTES.AUTOMATION.CAMPAIGNS_NEW)}>
              <Plus /> New Program
            </Link>
          </Button>
        )
      }
    >
      {isEmpty ? (
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
      ) : (
        <div className="flex flex-col gap-8">
          {isLoading || hasLoadError ? null : (
            <CampaignStatsStrip campaigns={campaigns} />
          )}

          <CollectionSection
            data-testid="campaign-needs-you"
            description={translate('needsYouDescription')}
            isCountVisible
            itemCount={needsYouCampaigns.length}
            title={translate('needsYou')}
          >
            <CollectionList>
              {needsYouCampaigns.map((campaign) => (
                <CampaignRow campaign={campaign} isNeedsYou key={campaign.id} />
              ))}
            </CollectionList>
          </CollectionSection>

          <CollectionSection
            actions={
              hasLoadError ? undefined : (
                <CollectionToolbar onViewChange={setView} view={view} />
              )
            }
            data-testid="campaign-all"
            error={
              hasLoadError ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span>{translate('loadError')}</span>
                  <Button
                    onClick={() => void refresh()}
                    size={ButtonSize.SM}
                    variant={ButtonVariant.SECONDARY}
                  >
                    {translate('retry')}
                  </Button>
                </div>
              ) : undefined
            }
            isCountVisible
            isLoading={isLoading}
            itemCount={campaigns.length}
            title={translate('all')}
          >
            <CollectionView
              data-testid="campaign-collection"
              getItemKey={getCampaignKey}
              isLoading={isLoading}
              items={campaigns}
              maxColumns={3}
              renderGridItem={renderCampaignCard}
              renderListItem={renderCampaignRow}
              view={view}
            />
          </CollectionSection>
        </div>
      )}
    </Container>
  );
}
