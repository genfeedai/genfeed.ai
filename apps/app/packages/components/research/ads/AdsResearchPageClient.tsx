'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/enums';
import type {
  AdPack,
  AdsChannel,
  AdsResearchDetail,
  AdsResearchFilters,
  AdsResearchItem,
  AdsResearchMetric,
  AdsResearchPlatform,
  AdsResearchResponse,
  AdsResearchSource,
  AdsResearchTimeframe,
  CampaignLaunchPrep,
} from '@genfeedai/interfaces';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  AdsResearchService,
  type UnifiedAdAccountOption,
} from '@services/ads/ads-research.service';
import Button from '@ui/buttons/base/Button';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import Badge from '@ui/display/badge/Badge';
import Alert from '@ui/feedback/alert/Alert';
import FormSearchbar from '@ui/forms/inputs/searchbar/form-searchbar/FormSearchbar';
import Container from '@ui/layout/container/Container';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Input } from '@ui/primitives/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import Link from 'next/link';
import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineArrowTopRightOnSquare,
  HiOutlineChartBar,
  HiOutlineFunnel,
  HiOutlineMegaphone,
  HiOutlineRocketLaunch,
  HiOutlineSparkles,
  HiOutlineWrenchScrewdriver,
  HiOutlineXMark,
  HiTableCells,
  HiViewColumns,
} from 'react-icons/hi2';

const ALL_FILTER_VALUE = '__all__';

const SOURCE_OPTIONS: Array<{ label: string; value: AdsResearchSource }> = [
  { label: 'Public + My Accounts', value: 'all' },
  { label: 'Public', value: 'public' },
  { label: 'My Accounts', value: 'my_accounts' },
];

const PLATFORM_OPTIONS: Array<{
  label: string;
  value: AdsResearchPlatform | 'all';
}> = [
  { label: 'All Platforms', value: 'all' },
  { label: 'Meta Ads', value: 'meta' },
  { label: 'Google Ads', value: 'google' },
];

const GOOGLE_CHANNEL_OPTIONS: Array<{ label: string; value: AdsChannel }> = [
  { label: 'All Inventory', value: 'all' },
  { label: 'Search', value: 'search' },
  { label: 'Display', value: 'display' },
  { label: 'YouTube', value: 'youtube' },
];

const METRIC_OPTIONS: Array<{ label: string; value: AdsResearchMetric }> = [
  { label: 'Performance Score', value: 'performanceScore' },
  { label: 'CTR', value: 'ctr' },
  { label: 'ROAS', value: 'roas' },
  { label: 'Conversions', value: 'conversions' },
  { label: 'Spend Efficiency', value: 'spendEfficiency' },
];

const TIMEFRAME_OPTIONS: Array<{
  label: string;
  value: AdsResearchTimeframe;
}> = [
  { label: 'Last 7 Days', value: 'last_7_days' },
  { label: 'Last 30 Days', value: 'last_30_days' },
  { label: 'Last 90 Days', value: 'last_90_days' },
  { label: 'All Time', value: 'all_time' },
];

const SORT_OPTIONS = [
  { label: 'Score (High → Low)', value: 'score' },
  { label: 'CTR (High → Low)', value: 'ctr' },
  { label: 'ROAS (High → Low)', value: 'roas' },
];

const EMPTY_RESPONSE: AdsResearchResponse = {
  connectedAds: [],
  filters: {},
  publicAds: [],
  summary: {
    connectedCount: 0,
    publicCount: 0,
    reviewPolicy: 'All remixes and launch prep remain paused for review.',
    selectedPlatform: 'all',
    selectedSource: 'all',
  },
};

type SelectedAdRef = {
  adAccountId?: string;
  channel?: AdsChannel;
  credentialId?: string;
  id: string;
  loginCustomerId?: string;
  platform?: AdsResearchPlatform;
  source: 'public' | 'my_accounts';
};

type CredentialOption = {
  id: string;
  externalHandle?: string;
  externalId?: string;
  platform?: string;
};

type AdSortKey = 'score' | 'ctr' | 'roas';

function formatMetric(value?: number): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/a';
  }

  if (value >= 1000) {
    return value.toLocaleString();
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function getBrandLabel(selectedBrand?: { label?: string; name?: string }) {
  return selectedBrand?.label || selectedBrand?.name || 'Brand';
}

function getCredentialLabel(credential: {
  id: string;
  externalHandle?: string;
  externalId?: string;
  platform?: string;
}) {
  return (
    credential.externalHandle ||
    credential.externalId ||
    credential.platform ||
    credential.id
  );
}

function getMetricValue(
  item: AdsResearchItem,
  metric: AdsResearchMetric,
): number | undefined {
  switch (metric) {
    case 'ctr':
      return item.metrics.ctr;
    case 'roas':
      return item.metrics.roas;
    case 'conversions':
      return item.metrics.conversions;
    default:
      return item.metrics.performanceScore ?? item.metricValue;
  }
}

function getMetricLabel(metric: AdsResearchMetric): string {
  switch (metric) {
    case 'ctr':
      return 'CTR';
    case 'roas':
      return 'ROAS';
    case 'conversions':
      return 'Conversions';
    case 'spendEfficiency':
      return 'Efficiency';
    default:
      return 'Score';
  }
}

function FilterSelect<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <Select
      value={value || (ALL_FILTER_VALUE as T)}
      onValueChange={(nextValue) =>
        onChange((nextValue === ALL_FILTER_VALUE ? '' : nextValue) as T)
      }
    >
      <SelectTrigger className="h-8 w-auto min-w-[120px] bg-transparent text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem
            key={option.value || ALL_FILTER_VALUE}
            value={option.value || ALL_FILTER_VALUE}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AdGridCard({
  isSelected,
  item,
  metric,
  onSelect,
}: {
  isSelected: boolean;
  item: AdsResearchItem;
  metric: AdsResearchMetric;
  onSelect: (item: AdsResearchItem) => void;
}) {
  const metricValue = getMetricValue(item, metric);
  const previewUrl = item.previewUrl || item.imageUrls?.[0];

  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        'group rounded-xl border border-white/[0.06] bg-card p-4 text-left transition-all duration-200 hover:border-white/[0.10]',
        isSelected && 'border-primary/45 shadow-lg shadow-primary/10',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-card text-white/70">
            <HiOutlineMegaphone className="h-4 w-4" />
          </div>

          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-semibold text-foreground">
              {item.title}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant={item.source === 'public' ? 'blue' : 'accent'}>
                {item.source === 'public' ? 'Public' : 'Connected'}
              </Badge>
              <Badge variant="ghost">
                {item.platform === 'meta' ? 'Meta' : 'Google'}
              </Badge>
              {item.channel !== 'all' && (
                <Badge variant="ghost">{item.channel}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-white/[0.06] bg-card px-3 py-2 text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">
            {getMetricLabel(metric)}
          </div>
          <div className="text-lg font-semibold text-foreground">
            {formatMetric(metricValue)}
          </div>
        </div>
      </div>

      <p className="mt-4 line-clamp-4 min-h-[5rem] text-sm leading-6 text-foreground/72">
        {item.headline || item.body || item.explanation || 'No copy available.'}
      </p>

      {previewUrl && (
        <div className="mt-3 overflow-hidden rounded-lg border border-white/[0.06] bg-black/20">
          {/* biome-ignore lint/performance/noImgElement: dynamic external ad preview URLs */}
          <img
            src={previewUrl}
            alt={item.title}
            className="h-36 w-full object-cover"
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {item.accountName && (
          <span className="rounded-full border border-white/[0.06] bg-card px-2.5 py-1 text-xs text-foreground/60">
            {item.accountName}
          </span>
        )}
        {item.industry && (
          <span className="rounded-full border border-white/[0.06] bg-card px-2.5 py-1 text-xs text-foreground/60">
            {item.industry}
          </span>
        )}
      </div>
    </button>
  );
}

function AdTableRow({
  isSelected,
  item,
  metric,
  onSelect,
}: {
  isSelected: boolean;
  item: AdsResearchItem;
  metric: AdsResearchMetric;
  onSelect: (item: AdsResearchItem) => void;
}) {
  const metricValue = getMetricValue(item, metric);

  return (
    <TableRow
      className={cn(
        'cursor-pointer border-b border-white/[0.06] transition-colors hover:bg-white/[0.03]',
        isSelected && 'bg-primary/5',
      )}
      onClick={() => onSelect(item)}
    >
      <TableCell className="px-4 py-3">
        <Badge variant="ghost">
          {item.platform === 'meta' ? 'Meta' : 'Google'}
        </Badge>
      </TableCell>
      <TableCell className="max-w-[300px] px-4 py-3">
        <span className="line-clamp-1 text-sm font-medium text-foreground">
          {item.title}
        </span>
      </TableCell>
      <TableCell className="px-4 py-3">
        <Badge variant={item.source === 'public' ? 'blue' : 'accent'}>
          {item.source === 'public' ? 'Public' : 'Connected'}
        </Badge>
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/60">
        {formatMetric(metricValue)}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/60">
        {formatMetric(item.metrics.ctr)}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/60">
        {item.channel !== 'all' ? item.channel : '—'}
      </TableCell>
      <TableCell className="px-4 py-3 text-sm text-foreground/40">
        {item.accountName || '—'}
      </TableCell>
    </TableRow>
  );
}

function SummaryMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/[0.06] bg-card p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-foreground/45">
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

function AdPackPanel({ adPack }: { adPack: AdPack }) {
  return (
    <div className="space-y-4 rounded-xl bg-emerald-500/5 p-4">
      <div className="flex items-center gap-2">
        <Badge variant="success">Ad Pack Ready</Badge>
        <span className="text-sm text-muted-foreground">
          Review before launch
        </span>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Headlines
        </div>
        <div className="space-y-2">
          {adPack.headlines.map((headline) => (
            <div
              key={headline}
              className="rounded-lg border border-white/[0.06] bg-card px-3 py-2 text-sm text-foreground"
            >
              {headline}
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Primary Text
        </div>
        <p className="whitespace-pre-wrap text-sm text-foreground/85">
          {adPack.primaryText}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
            CTA
          </div>
          <p className="text-sm text-foreground/85">{adPack.cta}</p>
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
            Channel
          </div>
          <p className="text-sm text-foreground/85">
            {adPack.campaignRecipe.platform === 'meta'
              ? 'Meta Ads'
              : 'Google Ads'}{' '}
            / {adPack.campaignRecipe.channel}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Creative Brief
        </div>
        <p className="text-sm text-foreground/85">
          {adPack.assetCreativeBrief}
        </p>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Targeting Notes
        </div>
        <p className="text-sm text-foreground/85">{adPack.targetingNotes}</p>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Campaign Recipe
        </div>
        <p className="text-sm text-foreground/85">
          {adPack.campaignRecipe.budgetStrategy}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {adPack.campaignRecipe.placements.map((placement) => (
            <Badge key={placement} variant="ghost">
              {placement}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function LaunchPrepPanel({ prep }: { prep: CampaignLaunchPrep }) {
  const { href } = useOrgUrl();

  return (
    <div className="space-y-4 rounded-xl bg-amber-500/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Badge variant="warning">Review Required</Badge>
          <span className="text-sm text-muted-foreground">
            Campaign stays paused until approved
          </span>
        </div>
        <Badge variant="ghost">{prep.publishMode}</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <SummaryMetricCard label="Campaign" value={prep.campaign.name} />
        <SummaryMetricCard label="Ad Set" value={prep.adSet.name} />
        <SummaryMetricCard label="Ad" value={prep.ad.name} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
            Objective
          </div>
          <p className="text-sm text-foreground/85">
            {prep.campaign.objective}
          </p>
        </div>
        <div>
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
            Optimization Goal
          </div>
          <p className="text-sm text-foreground/85">
            {prep.adSet.optimizationGoal}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
          Launch Notes
        </div>
        <ul className="space-y-2 text-sm text-foreground/85">
          {prep.notes.map((note) => (
            <li
              key={note}
              className="rounded-lg border border-white/[0.06] bg-card px-3 py-2"
            >
              {note}
            </li>
          ))}
        </ul>
      </div>

      {prep.workflowId && (
        <Link
          href={href(`/workflows/${prep.workflowId}`)}
          className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
        >
          Open linked workflow
          <HiOutlineArrowTopRightOnSquare className="h-4 w-4" />
        </Link>
      )}
    </div>
  );
}

function DetailSidebar({
  detail,
  detailLoading,
  href,
  onClose,
  onRunAction,
  busyAction,
  actionError,
  adPackResult,
  launchPrepResult,
  workflowResult,
}: {
  detail: AdsResearchDetail | null;
  detailLoading: boolean;
  href: (path: string) => string;
  selectedAd: SelectedAdRef;
  onClose: () => void;
  onRunAction: (action: 'ad_pack' | 'workflow' | 'launch_prep') => void;
  busyAction: 'ad_pack' | 'workflow' | 'launch_prep' | null;
  actionError: string | null;
  adPackResult: AdPack | null;
  launchPrepResult: CampaignLaunchPrep | null;
  workflowResult: {
    description?: string;
    workflowId: string;
    workflowName: string;
  } | null;
  brandLabel: string;
}) {
  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[480px] overflow-y-auto border-l border-white/[0.06] bg-background shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/[0.06] bg-background px-5 py-4">
          <div className="flex items-center gap-2">
            <HiOutlineChartBar className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Ad Detail</h2>
          </div>
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.SM}
            icon={<HiOutlineXMark className="h-4 w-4" />}
            onClick={onClose}
            ariaLabel="Close detail"
          />
        </div>

        <div className="space-y-5 p-5">
          {detailLoading || !detail ? (
            <p className="text-sm text-muted-foreground">
              Loading ad detail...
            </p>
          ) : (
            <>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="ghost">
                    {detail.platform === 'meta' ? 'Meta Ads' : 'Google Ads'}
                  </Badge>
                  {detail.channel !== 'all' && (
                    <Badge variant="ghost">{detail.channel}</Badge>
                  )}
                  {detail.status && <Badge status={detail.status} />}
                </div>

                <div>
                  <h3 className="text-xl font-semibold text-foreground">
                    {detail.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {detail.accountName || detail.campaignName || 'Ad detail'}
                  </p>
                </div>

                <p className="text-sm leading-6 text-foreground/85">
                  {detail.explanation}
                </p>

                {detail.creative.headline && (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                      Headline
                    </div>
                    <p className="text-sm text-foreground/85">
                      {detail.creative.headline}
                    </p>
                  </div>
                )}

                {detail.creative.body && (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                      Primary Text
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-foreground/85">
                      {detail.creative.body}
                    </p>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <SummaryMetricCard
                    label="CTR"
                    value={formatMetric(detail.metrics.ctr)}
                  />
                  <SummaryMetricCard
                    label="ROAS"
                    value={formatMetric(detail.metrics.roas)}
                  />
                </div>

                <div>
                  <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                    Detected Patterns
                  </div>
                  {detail.patternSummary && detail.patternSummary.length > 0 ? (
                    <div className="space-y-2">
                      {detail.patternSummary.map((pattern) => (
                        <div
                          key={`${pattern.id}-${pattern.label}`}
                          className="rounded-lg border border-white/[0.06] bg-card p-3"
                        >
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {pattern.label}
                            </span>
                            {typeof pattern.score === 'number' && (
                              <Badge variant="ghost">
                                {formatMetric(pattern.score)}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {pattern.summary}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No reusable pattern summary was attached to this ad yet.
                    </p>
                  )}
                </div>

                {detail.landingPageUrl && (
                  <a
                    href={detail.landingPageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Open landing page
                    <HiOutlineArrowTopRightOnSquare className="h-4 w-4" />
                  </a>
                )}
              </div>

              {actionError && (
                <Alert type={AlertCategory.ERROR}>
                  <div className="text-xs">{actionError}</div>
                </Alert>
              )}

              <div className="grid gap-2">
                <Button
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  isLoading={busyAction === 'ad_pack'}
                  onClick={() => onRunAction('ad_pack')}
                  icon={<HiOutlineSparkles className="h-4 w-4" />}
                >
                  Remix for my brand
                </Button>
                <Button
                  variant={ButtonVariant.DEFAULT}
                  size={ButtonSize.SM}
                  isLoading={busyAction === 'workflow'}
                  onClick={() => onRunAction('workflow')}
                  icon={<HiOutlineWrenchScrewdriver className="h-4 w-4" />}
                >
                  Create workflow
                </Button>
                <Button
                  variant={ButtonVariant.OUTLINE}
                  size={ButtonSize.SM}
                  isLoading={busyAction === 'launch_prep'}
                  onClick={() => onRunAction('launch_prep')}
                  icon={<HiOutlineRocketLaunch className="h-4 w-4" />}
                >
                  Prepare campaign
                </Button>
              </div>

              {workflowResult && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Badge variant="primary">Workflow Created</Badge>
                    <span className="text-sm font-medium text-foreground">
                      {workflowResult.workflowName}
                    </span>
                  </div>
                  {workflowResult.description && (
                    <p className="mb-3 text-sm text-foreground/75">
                      {workflowResult.description}
                    </p>
                  )}
                  <Link
                    href={href(`/workflows/${workflowResult.workflowId}`)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-primary transition-colors hover:text-primary/80"
                  >
                    Open workflow editor
                    <HiOutlineArrowTopRightOnSquare className="h-4 w-4" />
                  </Link>
                </div>
              )}

              {adPackResult && <AdPackPanel adPack={adPackResult} />}
              {launchPrepResult && <LaunchPrepPanel prep={launchPrepResult} />}
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default function AdsResearchPageClient({
  initialPlatform = 'all',
}: {
  initialPlatform?: AdsResearchPlatform | 'all';
}) {
  const { href } = useOrgUrl();
  const { brandId, credentials, isReady, selectedBrand } = useBrand();
  const getAdsResearchService = useAuthedService((token: string) =>
    AdsResearchService.getInstance(token),
  );

  const [source, setSource] = useState<AdsResearchSource>('all');
  const [platform, setPlatform] = useState<AdsResearchPlatform | 'all'>(
    initialPlatform,
  );
  const [channel, setChannel] = useState<AdsChannel>('all');
  const [metric, setMetric] = useState<AdsResearchMetric>('performanceScore');
  const [timeframe, setTimeframe] =
    useState<AdsResearchTimeframe>('last_30_days');
  const [industry, setIndustry] = useState('');
  const [credentialId, setCredentialId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [loginCustomerId, setLoginCustomerId] = useState('');
  const [selectedAd, setSelectedAd] = useState<SelectedAdRef | null>(null);
  const [busyAction, setBusyAction] = useState<
    'ad_pack' | 'workflow' | 'launch_prep' | null
  >(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adPackResult, setAdPackResult] = useState<AdPack | null>(null);
  const [launchPrepResult, setLaunchPrepResult] =
    useState<CampaignLaunchPrep | null>(null);
  const [workflowResult, setWorkflowResult] = useState<{
    description?: string;
    workflowId: string;
    workflowName: string;
  } | null>(null);

  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<AdSortKey>('score');
  const [viewType, setViewType] = useState<ViewType>(ViewType.GRID);
  const [showFilters, setShowFilters] = useState(false);

  const brandLabel = getBrandLabel(selectedBrand);
  const effectivePlatform =
    initialPlatform === 'all' ? platform : initialPlatform;
  const showChannelFilter = effectivePlatform === 'google';

  useEffect(() => {
    if (!showChannelFilter && channel !== 'all') {
      setChannel('all');
    }
  }, [channel, showChannelFilter]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset ad account when credential changes
  useEffect(() => {
    setAdAccountId('');
  }, [credentialId]);

  const credentialOptions = useMemo(
    () =>
      credentials
        .filter((credential) => {
          const value = String(credential.platform || '').toLowerCase();

          if (effectivePlatform === 'meta') {
            return value === 'facebook' || value === 'meta';
          }

          if (effectivePlatform === 'google') {
            return value === 'google_ads' || value === 'google';
          }

          return (
            value === 'facebook' ||
            value === 'meta' ||
            value === 'google_ads' ||
            value === 'google'
          );
        })
        .map((credential) => credential as CredentialOption),
    [credentials, effectivePlatform],
  );

  const filters: AdsResearchFilters = useMemo(
    () => ({
      adAccountId: adAccountId || undefined,
      brandId: brandId || undefined,
      brandName: brandLabel,
      channel: showChannelFilter ? channel : undefined,
      credentialId: credentialId || undefined,
      industry: industry || undefined,
      limit: 12,
      loginCustomerId: loginCustomerId || undefined,
      metric,
      platform: effectivePlatform === 'all' ? undefined : effectivePlatform,
      source,
      timeframe,
    }),
    [
      adAccountId,
      brandId,
      brandLabel,
      channel,
      credentialId,
      effectivePlatform,
      industry,
      loginCustomerId,
      metric,
      showChannelFilter,
      source,
      timeframe,
    ],
  );

  const {
    data: results,
    error: resultsError,
    isLoading,
    refresh,
  } = useResource(
    async () => {
      const service = await getAdsResearchService();
      return await service.list(filters);
    },
    {
      defaultValue: EMPTY_RESPONSE,
      dependencies: [filters, isReady],
      enabled: isReady,
    },
  );

  const { data: adAccounts, error: accountsError } = useResource(
    async () => {
      const service = await getAdsResearchService();
      return await service.listAdAccounts({
        credentialId,
        loginCustomerId: loginCustomerId || undefined,
        platform: effectivePlatform as AdsResearchPlatform,
      });
    },
    {
      defaultValue: [] as UnifiedAdAccountOption[],
      dependencies: [credentialId, effectivePlatform, loginCustomerId],
      enabled: !!credentialId && effectivePlatform !== 'all',
    },
  );

  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
  } = useResource(
    async () => {
      if (!selectedAd) {
        return null;
      }

      const service = await getAdsResearchService();
      return await service.getDetail(selectedAd);
    },
    {
      dependencies: [selectedAd],
      enabled: !!selectedAd,
    },
  );

  // Combine all ads into a single flat list
  const allAds = useMemo(() => {
    const combined = [...results.publicAds, ...results.connectedAds];

    // Filter by search
    let filtered = combined;
    if (search.trim()) {
      const query = search.toLowerCase();
      filtered = combined.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.headline?.toLowerCase().includes(query) ||
          item.body?.toLowerCase().includes(query) ||
          item.accountName?.toLowerCase().includes(query),
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortKey) {
        case 'ctr':
          return (b.metrics.ctr ?? 0) - (a.metrics.ctr ?? 0);
        case 'roas':
          return (b.metrics.roas ?? 0) - (a.metrics.roas ?? 0);
        default:
          return (
            (b.metrics.performanceScore ?? b.metricValue ?? 0) -
            (a.metrics.performanceScore ?? a.metricValue ?? 0)
          );
      }
    });

    return filtered;
  }, [results.publicAds, results.connectedAds, search, sortKey]);

  const handleSelectAd = (item: AdsResearchItem) => {
    setActionError(null);
    setAdPackResult(null);
    setLaunchPrepResult(null);
    setWorkflowResult(null);

    setSelectedAd({
      adAccountId: item.adAccountId || adAccountId || undefined,
      channel: item.channel,
      credentialId: item.credentialId || credentialId || undefined,
      id: item.source === 'my_accounts' ? item.sourceId : item.id,
      loginCustomerId: item.loginCustomerId || loginCustomerId || undefined,
      platform: item.platform,
      source: item.source,
    });
  };

  const handleCloseDetail = () => {
    setSelectedAd(null);
    setActionError(null);
    setAdPackResult(null);
    setLaunchPrepResult(null);
    setWorkflowResult(null);
  };

  const runAction = async (action: 'ad_pack' | 'workflow' | 'launch_prep') => {
    if (!selectedAd) {
      return;
    }

    setBusyAction(action);
    setActionError(null);

    try {
      const service = await getAdsResearchService();
      const payload = {
        adAccountId: selectedAd.adAccountId,
        adId: selectedAd.id,
        brandId: brandId || undefined,
        brandName: brandLabel,
        channel: selectedAd.channel,
        credentialId: selectedAd.credentialId,
        industry: industry || undefined,
        loginCustomerId: selectedAd.loginCustomerId,
        objective: 'Conversions',
        platform: selectedAd.platform,
        source: selectedAd.source,
      } as const;

      if (action === 'ad_pack') {
        const result = await service.generateAdPack(payload);
        setAdPackResult(result);
        setLaunchPrepResult(null);
        setWorkflowResult(null);
        return;
      }

      if (action === 'workflow') {
        const result = await service.createRemixWorkflow(payload);
        setAdPackResult(result.adPack);
        setLaunchPrepResult(null);
        setWorkflowResult({
          description: result.workflowDescription,
          workflowId: result.workflowId,
          workflowName: result.workflowName,
        });
        return;
      }

      if (!selectedAd.credentialId || !selectedAd.adAccountId) {
        throw new Error(
          'Choose a connected credential and ad account before preparing a campaign for review.',
        );
      }

      const result = await service.prepareCampaignForReview({
        ...payload,
        campaignName: `${brandLabel} ${selectedAd.platform === 'meta' ? 'Meta' : 'Google'} Campaign`,
        createWorkflow: true,
        dailyBudget: 50,
      });

      setAdPackResult(result.adPack);
      setLaunchPrepResult(result);
      setWorkflowResult(
        result.workflowId
          ? {
              workflowId: result.workflowId,
              workflowName: result.workflowName || 'Ad launch prep',
            }
          : null,
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : 'Action failed. Try again.',
      );
    } finally {
      setBusyAction(null);
    }
  };

  const selectedKey = selectedAd
    ? `${selectedAd.source}:${selectedAd.platform}:${selectedAd.id}`
    : '';

  return (
    <Container
      label="Ads Intelligence"
      description="Find winning ads, remix for your brand."
      headerTabs={{
        activeTab: initialPlatform,
        fullWidth: false,
        items: [
          {
            href: '/research/ads',
            id: 'all',
            label: 'Overview',
            matchMode: 'exact',
          },
          { href: '/research/ads/meta', id: 'meta', label: 'Meta' },
          {
            href: '/research/ads/google',
            id: 'google',
            label: 'Google + YouTube',
          },
        ],
        variant: 'default',
      }}
      icon={HiOutlineMegaphone}
      right={
        <div className="flex items-center gap-2">
          <ViewToggle
            options={[
              {
                icon: <HiViewColumns className="h-4 w-4" />,
                label: 'Grid view',
                type: ViewType.GRID,
              },
              {
                icon: <HiTableCells className="h-4 w-4" />,
                label: 'Table view',
                type: ViewType.TABLE,
              },
            ]}
            activeView={viewType}
            onChange={setViewType}
          />
        </div>
      }
    >
      {/* Stats Bar */}
      <div className="mb-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
            Public Winners
          </span>
          <span className="text-lg font-semibold text-foreground">
            {results.summary.publicCount}
          </span>
        </div>
        <div className="hidden h-4 w-px bg-white/[0.06] sm:block" />
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
            Connected Ads
          </span>
          <span className="text-lg font-semibold text-foreground">
            {results.summary.connectedCount}
          </span>
        </div>
        <div className="hidden h-4 w-px bg-white/[0.06] sm:block" />
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
            Source
          </span>
          <span className="text-lg font-semibold text-foreground">
            {results.summary.selectedSource === 'my_accounts'
              ? 'My Accounts'
              : results.summary.selectedSource === 'public'
                ? 'Public'
                : 'All'}
          </span>
        </div>
        <div className="hidden h-4 w-px bg-white/[0.06] sm:block" />
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] uppercase tracking-[0.18em] text-foreground/40">
            Review Policy
          </span>
          <span className="text-lg font-semibold text-foreground">Paused</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="w-full md:w-80">
            <FormSearchbar
              value={search}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setSearch(event.target.value)
              }
              onClear={() => setSearch('')}
              placeholder="Search ads"
              size={ComponentSize.MD}
              className="w-full"
              inputClassName="rounded-lg border-white/[0.06] bg-card text-white/90 focus:border-white/[0.10] focus:outline-none"
            />
          </div>
          <Button
            variant={
              showFilters ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
            }
            size={ButtonSize.SM}
            icon={<HiOutlineFunnel className="h-4 w-4" />}
            onClick={() => setShowFilters(!showFilters)}
            className="rounded-lg border border-white/[0.06]"
          >
            Filters
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <ButtonDropdown
            name="sort"
            value={sortKey}
            options={SORT_OPTIONS}
            onChange={(_name, value) => setSortKey(value as AdSortKey)}
            className="h-10 rounded-lg border border-white/[0.06] bg-card px-3 text-white/80 hover:bg-white/[0.04] hover:text-white"
          />
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.SM}
            onClick={() => refresh()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Collapsible Filter Panel */}
      {showFilters && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {initialPlatform === 'all' && (
            <FilterSelect
              label="Platform"
              options={PLATFORM_OPTIONS}
              value={platform}
              onChange={(value) =>
                setPlatform((value || 'all') as AdsResearchPlatform | 'all')
              }
            />
          )}
          <FilterSelect
            label="Source"
            options={SOURCE_OPTIONS}
            value={source}
            onChange={setSource}
          />
          {showChannelFilter && (
            <FilterSelect
              label="Google Channel"
              options={GOOGLE_CHANNEL_OPTIONS}
              value={channel}
              onChange={setChannel}
            />
          )}
          <FilterSelect
            label="Metric"
            options={METRIC_OPTIONS}
            value={metric}
            onChange={setMetric}
          />
          <FilterSelect
            label="Timeframe"
            options={TIMEFRAME_OPTIONS}
            value={timeframe}
            onChange={setTimeframe}
          />
          <Input
            value={industry}
            onChange={(event) => setIndustry(event.target.value)}
            placeholder="Niche / industry..."
            className="h-8 w-[160px] text-xs"
          />
          <Select
            value={credentialId || ALL_FILTER_VALUE}
            onValueChange={(value) =>
              setCredentialId(value === ALL_FILTER_VALUE ? '' : value)
            }
          >
            <SelectTrigger className="h-8 w-auto min-w-[160px] bg-transparent text-xs">
              <SelectValue placeholder="Credential" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>No credential</SelectItem>
              {credentialOptions.map((credential: CredentialOption) => (
                <SelectItem key={credential.id} value={credential.id}>
                  {getCredentialLabel(credential)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={adAccountId || ALL_FILTER_VALUE}
            onValueChange={(value) =>
              setAdAccountId(value === ALL_FILTER_VALUE ? '' : value)
            }
          >
            <SelectTrigger className="h-8 w-auto min-w-[160px] bg-transparent text-xs">
              <SelectValue placeholder="Ad Account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>No ad account</SelectItem>
              {adAccounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name || account.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {effectivePlatform === 'google' && (
            <Input
              value={loginCustomerId}
              onChange={(event) => setLoginCustomerId(event.target.value)}
              placeholder="MCC / manager ID"
              className="h-8 w-[140px] text-xs"
            />
          )}
        </div>
      )}

      {(resultsError || accountsError || detailError) && (
        <Alert type={AlertCategory.ERROR} className="mb-6">
          <div className="space-y-1">
            <div className="font-medium">Ads hub needs attention</div>
            <div className="text-xs text-foreground/70">
              {detailError?.message ||
                accountsError?.message ||
                resultsError?.message ||
                'Try refreshing the page.'}
            </div>
          </div>
        </Alert>
      )}

      <Alert type={AlertCategory.INFO} className="mb-6">
        <div className="space-y-1">
          <div className="font-medium">Launch policy</div>
          <div className="text-xs text-foreground/70">
            {results.summary.reviewPolicy}
          </div>
        </div>
      </Alert>

      {/* Card Grid / Table */}
      {viewType === ViewType.GRID ? (
        allAds.length === 0 && !isLoading ? (
          <div className="py-8 text-center text-sm text-foreground/40">
            {search.trim()
              ? 'No ads match your search.'
              : 'No ads match the current filters. Adjust filters or widen the timeframe.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {allAds.map((item) => {
              const key =
                item.source === 'my_accounts'
                  ? `connected-${item.sourceId}`
                  : `public-${item.id}`;
              const itemKey =
                item.source === 'my_accounts'
                  ? `my_accounts:${item.platform}:${item.sourceId}`
                  : `public:${item.platform}:${item.id}`;

              return (
                <AdGridCard
                  key={key}
                  item={item}
                  metric={metric}
                  isSelected={selectedKey === itemKey}
                  onSelect={handleSelectAd}
                />
              );
            })}
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
          <Table className="w-full text-left">
            <TableHeader>
              <TableRow className="border-b border-white/[0.06] bg-card">
                <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  Platform
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  Title
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  Source
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  {getMetricLabel(metric)}
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  CTR
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  Channel
                </TableHead>
                <TableHead className="px-4 py-3 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                  Account
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allAds.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-foreground/40"
                  >
                    {search.trim()
                      ? 'No ads match your search.'
                      : 'No ads match the current filters.'}
                  </TableCell>
                </TableRow>
              ) : (
                allAds.map((item) => {
                  const key =
                    item.source === 'my_accounts'
                      ? `connected-${item.sourceId}`
                      : `public-${item.id}`;
                  const itemKey =
                    item.source === 'my_accounts'
                      ? `my_accounts:${item.platform}:${item.sourceId}`
                      : `public:${item.platform}:${item.id}`;

                  return (
                    <AdTableRow
                      key={key}
                      item={item}
                      metric={metric}
                      isSelected={selectedKey === itemKey}
                      onSelect={handleSelectAd}
                    />
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Slide-over Detail Sidebar */}
      {selectedAd && (
        <DetailSidebar
          detail={detail ?? null}
          detailLoading={detailLoading}
          href={href}
          selectedAd={selectedAd}
          onClose={handleCloseDetail}
          onRunAction={runAction}
          busyAction={busyAction}
          actionError={actionError}
          adPackResult={adPackResult}
          launchPrepResult={launchPrepResult}
          workflowResult={workflowResult}
          brandLabel={brandLabel}
        />
      )}
    </Container>
  );
}
