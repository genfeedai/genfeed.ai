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
  AdsResearchFilters,
  AdsResearchItem,
  AdsResearchMetric,
  AdsResearchPlatform,
  AdsResearchResponse,
  AdsResearchSource,
  AdsResearchTimeframe,
  CampaignLaunchPrep,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import {
  AdsResearchService,
  type UnifiedAdAccountOption,
} from '@services/ads/ads-research.service';
import { useQuery } from '@tanstack/react-query';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import type { ChangeEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineFunnel,
  HiOutlineMegaphone,
  HiTableCells,
  HiViewColumns,
} from 'react-icons/hi2';
import { AdsResearchAdGrid, AdsResearchAdTable } from './AdsResearchAdCards';
import { DetailSidebar } from './AdsResearchDetailSidebar';
import { AdsResearchFilterPanel } from './AdsResearchFilterPanel';

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

function getBrandLabel(selectedBrand?: { label?: string; name?: string }) {
  return selectedBrand?.label || selectedBrand?.name || 'Brand';
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

  useEffect(() => {
    if (!credentialId) {
      setAdAccountId('');
      return;
    }

    setAdAccountId('');
  }, [credentialId]);

  const credentialOptions = useMemo(
    () =>
      credentials.reduce<CredentialOption[]>((options, credential) => {
        const value = String(credential.platform || '').toLowerCase();

        if (effectivePlatform === 'meta') {
          if (value === 'facebook' || value === 'meta') {
            options.push(credential as CredentialOption);
          }
          return options;
        }

        if (effectivePlatform === 'google') {
          if (value === 'google_ads' || value === 'google') {
            options.push(credential as CredentialOption);
          }
          return options;
        }

        if (
          value === 'facebook' ||
          value === 'meta' ||
          value === 'google_ads' ||
          value === 'google'
        ) {
          options.push(credential as CredentialOption);
        }
        return options;
      }, []),
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
    data: results = EMPTY_RESPONSE,
    error: resultsError,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['ads-research', filters, isReady],
    queryFn: async () => {
      const service = await getAdsResearchService();
      return await service.list(filters);
    },
    enabled: isReady,
  });

  const {
    data: adAccounts = [] as UnifiedAdAccountOption[],
    error: accountsError,
  } = useQuery({
    queryKey: [
      'ads-ad-accounts',
      credentialId,
      effectivePlatform,
      loginCustomerId,
    ],
    queryFn: async () => {
      const service = await getAdsResearchService();
      return await service.listAdAccounts({
        credentialId,
        loginCustomerId: loginCustomerId || undefined,
        platform: effectivePlatform as AdsResearchPlatform,
      });
    },
    enabled: !!credentialId && effectivePlatform !== 'all',
  });

  const {
    data: detail,
    error: detailError,
    isLoading: detailLoading,
  } = useQuery({
    queryKey: ['ads-research-detail', selectedAd],
    queryFn: async () => {
      if (!selectedAd) {
        return null;
      }

      const service = await getAdsResearchService();
      return await service.getDetail(selectedAd);
    },
    enabled: !!selectedAd,
  });

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
                icon: <HiViewColumns className="size-4" />,
                label: 'Grid view',
                type: ViewType.GRID,
              },
              {
                icon: <HiTableCells className="size-4" />,
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
            icon={<HiOutlineFunnel className="size-4" />}
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
            onClick={() => refetch()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Collapsible Filter Panel */}
      {showFilters && (
        <AdsResearchFilterPanel
          adAccountId={adAccountId}
          adAccounts={adAccounts}
          channel={channel}
          credentialId={credentialId}
          credentialOptions={credentialOptions}
          effectivePlatform={effectivePlatform}
          industry={industry}
          initialPlatform={initialPlatform}
          loginCustomerId={loginCustomerId}
          metric={metric}
          platform={platform}
          showChannelFilter={showChannelFilter}
          source={source}
          timeframe={timeframe}
          onAdAccountChange={setAdAccountId}
          onChannelChange={setChannel}
          onCredentialChange={setCredentialId}
          onIndustryChange={setIndustry}
          onLoginCustomerIdChange={setLoginCustomerId}
          onMetricChange={setMetric}
          onPlatformChange={setPlatform}
          onSourceChange={setSource}
          onTimeframeChange={setTimeframe}
        />
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
        <AdsResearchAdGrid
          ads={allAds}
          isLoading={isLoading}
          metric={metric}
          search={search}
          selectedKey={selectedKey}
          onSelect={handleSelectAd}
        />
      ) : (
        <AdsResearchAdTable
          ads={allAds}
          metric={metric}
          search={search}
          selectedKey={selectedKey}
          onSelect={handleSelectAd}
        />
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
