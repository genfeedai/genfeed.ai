import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ViewType } from '@genfeedai/enums';
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
  useOptionalResearchWorkSurface,
  useResearchQueryState,
  useResearchSearchParamState,
  useRestoreResearchFinding,
} from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import {
  getResearchFindingReferenceKey,
  toAdsResearchFinding,
} from '@pages/research/work-surface/research-work-surface.types';
import {
  AdsResearchService,
  type UnifiedAdAccountOption,
} from '@services/ads/ads-research.service';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

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

const SOURCE_VALUES = ['all', 'my_accounts', 'public'] as const;
const PLATFORM_VALUES = ['all', 'google', 'meta'] as const;
const CHANNEL_VALUES = ['all', 'display', 'search', 'youtube'] as const;
const METRIC_VALUES = [
  'performanceScore',
  'ctr',
  'roas',
  'conversions',
  'spendEfficiency',
] as const;
const TIMEFRAME_VALUES = [
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'all_time',
] as const;
const SORT_VALUES = ['score', 'ctr', 'roas'] as const;
const VIEW_VALUES = [ViewType.GRID, ViewType.TABLE] as const;

function getBrandLabel(selectedBrand?: { label?: string; name?: string }) {
  return selectedBrand?.label || selectedBrand?.name || 'Brand';
}

export function useAdsResearchPageClient(
  initialPlatform: AdsResearchPlatform | 'all',
) {
  const { href } = useOrgUrl();
  const surface = useOptionalResearchWorkSurface();
  const { brandId, credentials, isReady, selectedBrand } = useBrand();
  const getAdsResearchService = useAuthedService((token: string) =>
    AdsResearchService.getInstance(token),
  );

  const [source, setSource] = useResearchSearchParamState<AdsResearchSource>({
    allowedValues: SOURCE_VALUES,
    defaultValue: 'all',
    key: 'source',
  });
  const [platform, setPlatform] = useResearchSearchParamState<
    AdsResearchPlatform | 'all'
  >({
    allowedValues:
      initialPlatform === 'all' ? PLATFORM_VALUES : [initialPlatform],
    defaultValue: initialPlatform,
    key: 'platform',
  });
  const [channel, setChannel] = useResearchSearchParamState<AdsChannel>({
    allowedValues: CHANNEL_VALUES,
    defaultValue: 'all',
    key: 'channel',
  });
  const [metric, setMetric] = useResearchSearchParamState<AdsResearchMetric>({
    allowedValues: METRIC_VALUES,
    defaultValue: 'performanceScore',
    key: 'metric',
  });
  const [timeframe, setTimeframe] =
    useResearchSearchParamState<AdsResearchTimeframe>({
      allowedValues: TIMEFRAME_VALUES,
      defaultValue: 'last_30_days',
      key: 'timeframe',
    });
  const [industry, setIndustry] = useResearchSearchParamState<string>({
    defaultValue: '',
    key: 'industry',
    maxLength: 120,
  });
  const [credentialId, setCredentialId] = useResearchSearchParamState<string>({
    defaultValue: '',
    key: 'credential',
  });
  const [adAccountId, setAdAccountId] = useResearchSearchParamState<string>({
    defaultValue: '',
    key: 'account',
  });
  const [loginCustomerId, setLoginCustomerId] =
    useResearchSearchParamState<string>({
      defaultValue: '',
      key: 'loginCustomer',
    });
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

  const [search, setSearch] = useResearchQueryState();
  const [sortKey, setSortKey] = useResearchSearchParamState<AdSortKey>({
    allowedValues: SORT_VALUES,
    defaultValue: 'score',
    key: 'sort',
  });
  const [viewType, setViewType] = useResearchSearchParamState<ViewType>({
    allowedValues: VIEW_VALUES,
    defaultValue: ViewType.GRID,
    key: 'view',
  });
  const [filtersVisibility, setFiltersVisibility] = useResearchSearchParamState<
    'hidden' | 'visible'
  >({
    allowedValues: ['hidden', 'visible'],
    defaultValue: 'hidden',
    key: 'filters',
  });
  const showFilters = filtersVisibility === 'visible';
  const setShowFilters = (isVisible: boolean) =>
    setFiltersVisibility(isVisible ? 'visible' : 'hidden');

  const brandLabel = getBrandLabel(selectedBrand);
  const effectivePlatform =
    initialPlatform === 'all' ? platform : initialPlatform;
  const showChannelFilter = effectivePlatform === 'google';

  useEffect(() => {
    if (!showChannelFilter && channel !== 'all') {
      setChannel('all');
    }
  }, [channel, setChannel, showChannelFilter]);

  useEffect(() => {
    if (!credentialId) {
      setAdAccountId('');
      return;
    }

    setAdAccountId('');
  }, [credentialId, setAdAccountId]);

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

  const allAds = useMemo(() => {
    const combined = [...results.publicAds, ...results.connectedAds];

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
  const findings = useMemo(() => allAds.map(toAdsResearchFinding), [allAds]);
  const requestedReference = surface?.urlState.requestedReference ?? null;

  useRestoreResearchFinding(findings, isLoading);

  useEffect(() => {
    if (!requestedReference) {
      setSelectedAd(null);
      return;
    }

    if (isLoading) {
      return;
    }

    const requestedKey = getResearchFindingReferenceKey(requestedReference);
    const item = allAds.find(
      (candidate) =>
        getResearchFindingReferenceKey(
          toAdsResearchFinding(candidate).reference,
        ) === requestedKey,
    );
    if (!item) {
      return;
    }

    setSelectedAd({
      adAccountId: item.adAccountId || adAccountId || undefined,
      channel: item.channel,
      credentialId: item.credentialId || credentialId || undefined,
      id: item.source === 'my_accounts' ? item.sourceId : item.id,
      loginCustomerId: item.loginCustomerId || loginCustomerId || undefined,
      platform: item.platform,
      source: item.source,
    });
  }, [
    adAccountId,
    allAds,
    credentialId,
    isLoading,
    loginCustomerId,
    requestedReference,
  ]);

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
    surface?.selectFinding(toAdsResearchFinding(item));
  };

  const handleCloseDetail = () => {
    setSelectedAd(null);
    setActionError(null);
    setAdPackResult(null);
    setLaunchPrepResult(null);
    setWorkflowResult(null);
    surface?.clearFinding();
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

  return {
    adAccounts,
    adPackResult,
    actionError,
    allAds,
    busyAction,
    credentialOptions,
    detail,
    detailError,
    detailLoading,
    effectivePlatform,
    filters,
    handleCloseDetail,
    handleSelectAd,
    href,
    industry,
    isLoading,
    launchPrepResult,
    metric,
    platform,
    refetch,
    results,
    resultsError,
    accountsError,
    runAction,
    search,
    selectedAd,
    selectedKey,
    setAdAccountId,
    setChannel,
    setCredentialId,
    setIndustry,
    setLoginCustomerId,
    setMetric,
    setPlatform,
    setSearch,
    setShowFilters,
    setSource,
    setSortKey,
    setTimeframe,
    showChannelFilter,
    showFilters,
    sortKey,
    source,
    adAccountId,
    channel,
    credentialId,
    loginCustomerId,
    timeframe,
    brandLabel,
    viewType,
    setViewType,
    workflowResult,
  };
}
