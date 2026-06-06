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

function getBrandLabel(selectedBrand?: { label?: string; name?: string }) {
  return selectedBrand?.label || selectedBrand?.name || 'Brand';
}

export function useAdsResearchPageClient(
  initialPlatform: AdsResearchPlatform | 'all',
) {
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
