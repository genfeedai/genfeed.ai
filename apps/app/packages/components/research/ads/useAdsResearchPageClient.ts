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
  ISavedAd,
  SaveAdInput,
} from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSavedAds } from '@hooks/data/analytics/use-saved-ads/use-saved-ads';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useOptionalDiscoverRemix } from '@pages/research/remix/DiscoverRemixProvider';
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
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

const EMPTY_RESPONSE: AdsResearchResponse = {
  connectedAds: [],
  filters: {},
  publicAds: [],
  summary: {
    connectedCount: 0,
    publicCount: 0,
    reviewPolicy:
      'Launch plans require review. Ads Research does not create external campaign objects.',
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
  savedAdId?: string;
  sourceId?: string;
};

type CredentialOption = {
  id: string;
  externalHandle?: string;
  externalId?: string;
  platform?: string;
};

export type AdSortKey = 'score' | 'ctr' | 'roas' | 'longevity';
export type AdsResearchViewSource = AdsResearchSource | 'saved';

const SOURCE_VALUES = ['all', 'my_accounts', 'public', 'saved'] as const;
const PLATFORM_VALUES = ['all', 'google', 'meta', 'tiktok', 'x'] as const;
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
const SORT_VALUES = ['score', 'ctr', 'roas', 'longevity'] as const;
const VIEW_VALUES = [ViewType.GRID, ViewType.TABLE] as const;

function getBrandLabel(selectedBrand?: { label?: string; name?: string }) {
  return selectedBrand?.label || selectedBrand?.name || 'Brand';
}

function toSavedAdResearchItem(
  saved: ISavedAd,
  sourceLabel: string,
): AdsResearchItem {
  return {
    accountId: saved.advertiserId ?? undefined,
    accountName: saved.advertiserName ?? undefined,
    body: saved.body ?? undefined,
    channel: saved.channel,
    cta: saved.cta ?? undefined,
    explanation: saved.explanation,
    firstSeenAt: saved.firstSeenAt ?? undefined,
    headline: saved.headline ?? undefined,
    id: saved.sourceRecordId ?? saved.sourceAdId,
    imageUrls: saved.imageUrls,
    isSavedSnapshot: true,
    landingPageUrl: saved.landingPageUrl ?? undefined,
    lastSeenAt: saved.lastSeenAt ?? undefined,
    metrics: saved.metrics,
    patternSummary: saved.patternSummary,
    platform: saved.platform,
    previewUrl: saved.previewUrl ?? saved.imageUrls[0] ?? saved.videoUrls[0],
    savedAdId: saved.id,
    savedAt: saved.createdAt,
    savedNote: saved.note ?? undefined,
    source: saved.source,
    sourceId: saved.sourceAdId,
    sourceLabel,
    title: saved.title,
    usagePolicy: saved.usagePolicy,
    videoUrls: saved.videoUrls,
  };
}

function toSavedAdDetail(saved: ISavedAd, sourceLabel: string) {
  const item = toSavedAdResearchItem(saved, sourceLabel);
  return {
    ...item,
    creative: {
      body: item.body,
      cta: item.cta,
      headline: item.headline,
      imageUrls: item.imageUrls,
      landingPageUrl: item.landingPageUrl,
      videoUrls: item.videoUrls,
    },
  };
}

function findSavedSnapshot(
  savedAds: ISavedAd[],
  selectedAd: SelectedAdRef,
): ISavedAd | undefined {
  if (selectedAd.savedAdId) {
    const selectedSnapshot = savedAds.find(
      (item) => item.id === selectedAd.savedAdId,
    );
    if (selectedSnapshot) return selectedSnapshot;
  }

  const sourceAdId = selectedAd.sourceId || selectedAd.id;
  return savedAds.find(
    (item) =>
      item.platform === selectedAd.platform && item.sourceAdId === sourceAdId,
  );
}

export function buildSaveAdInput(
  item: AdsResearchItem,
  scope: {
    adAccountId: string;
    brandId: string;
    credentialId: string;
    loginCustomerId: string;
  },
): SaveAdInput {
  const isConnected = item.source === 'my_accounts';
  return {
    adAccountId: isConnected
      ? item.adAccountId || scope.adAccountId || undefined
      : item.adAccountId,
    adId: isConnected ? item.sourceId || item.id : item.id,
    brandId: scope.brandId,
    channel: item.channel,
    credentialId: isConnected
      ? item.credentialId || scope.credentialId || undefined
      : item.credentialId,
    loginCustomerId: isConnected
      ? item.loginCustomerId || scope.loginCustomerId || undefined
      : item.loginCustomerId,
    platform: item.platform,
    source: item.source,
  };
}

export function useAdsResearchPageClient(
  initialPlatform: AdsResearchPlatform | 'all',
) {
  const { href } = useOrgUrl();
  const translate = useTranslations('pages.adsResearch');
  const savedSourceLabel = translate('swipeFile.sourceLabel');
  const remixSurface = useOptionalDiscoverRemix();
  const surface = useOptionalResearchWorkSurface();
  const { brandId, credentials, isReady, selectedBrand } = useBrand();
  const getAdsResearchService = useAuthedService((token: string) =>
    AdsResearchService.getInstance(token),
  );
  const saved = useSavedAds();

  const [source, setSource] =
    useResearchSearchParamState<AdsResearchViewSource>({
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

        if (effectivePlatform === 'tiktok') {
          if (value === 'tiktok' || value === 'tiktok_ads') {
            options.push(credential as CredentialOption);
          }
          return options;
        }

        if (effectivePlatform === 'x') {
          if (value === 'x' || value === 'x_ads') {
            options.push(credential as CredentialOption);
          }
          return options;
        }

        if (
          value === 'facebook' ||
          value === 'meta' ||
          value === 'google_ads' ||
          value === 'google' ||
          value === 'tiktok' ||
          value === 'tiktok_ads' ||
          value === 'x' ||
          value === 'x_ads'
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
      source: source === 'saved' ? 'all' : source,
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
    enabled: isReady && source !== 'saved',
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
    enabled:
      !!credentialId && effectivePlatform !== 'all' && source !== 'saved',
  });

  const {
    data: liveDetail,
    error: detailError,
    isLoading: liveDetailLoading,
  } = useQuery({
    queryKey: ['ads-research-detail', selectedAd, source],
    queryFn: async () => {
      if (!selectedAd) {
        return null;
      }

      const service = await getAdsResearchService();
      return await service.getDetail(selectedAd);
    },
    enabled: !!selectedAd && source !== 'saved',
  });

  const selectedSnapshot = useMemo(
    () =>
      selectedAd ? findSavedSnapshot(saved.savedAds, selectedAd) : undefined,
    [saved.savedAds, selectedAd],
  );
  const detail = useMemo(() => {
    if (source === 'saved') {
      return selectedSnapshot
        ? toSavedAdDetail(selectedSnapshot, savedSourceLabel)
        : null;
    }
    if (!liveDetail) return liveDetail;
    return selectedSnapshot
      ? {
          ...liveDetail,
          savedAdId: selectedSnapshot.id,
          savedAt: selectedSnapshot.createdAt,
          savedNote: selectedSnapshot.note ?? undefined,
        }
      : liveDetail;
  }, [liveDetail, savedSourceLabel, selectedSnapshot, source]);
  const detailLoading =
    source === 'saved' ? saved.isLoading : liveDetailLoading;

  const allAds = useMemo(() => {
    const savedBySource = new Map(
      saved.savedAds
        .filter((item) => Boolean(item.sourceAdId))
        .map((item) => [`${item.platform}:${item.sourceAdId}`, item]),
    );
    const combined =
      source === 'saved'
        ? saved.savedAds
            .filter(
              (item) =>
                (effectivePlatform === 'all' ||
                  item.platform === effectivePlatform) &&
                (!showChannelFilter ||
                  channel === 'all' ||
                  item.channel === channel) &&
                (item.source === 'public' ||
                  ((!credentialId || item.credentialId === credentialId) &&
                    (!adAccountId || item.adAccountId === adAccountId) &&
                    (!loginCustomerId ||
                      item.loginCustomerId === loginCustomerId))),
            )
            .map((item) => toSavedAdResearchItem(item, savedSourceLabel))
        : [...results.publicAds, ...results.connectedAds].map((item) => {
            const sourceAdId = item.sourceId || item.id;
            const snapshot = sourceAdId
              ? savedBySource.get(`${item.platform}:${sourceAdId}`)
              : undefined;
            return snapshot
              ? {
                  ...item,
                  savedAdId: snapshot.id,
                  savedAt: snapshot.createdAt,
                  savedNote: snapshot.note ?? undefined,
                }
              : item;
          });

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
        case 'longevity':
          /**
           * Competitor archive rows have no CTR or ROAS to rank by, so they
           * sort last on every other key. Longevity is the axis they do carry:
           * how long the advertiser kept paying to run the creative. Ties
           * break on days on air so a saturated pair still orders sensibly.
           */
          return (
            (b.longevity?.score ?? -1) - (a.longevity?.score ?? -1) ||
            (b.longevity?.daysLive ?? 0) - (a.longevity?.daysLive ?? 0)
          );
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
  }, [
    adAccountId,
    channel,
    credentialId,
    effectivePlatform,
    loginCustomerId,
    results.publicAds,
    results.connectedAds,
    saved.savedAds,
    savedSourceLabel,
    search,
    showChannelFilter,
    sortKey,
    source,
  ]);
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
      savedAdId: item.savedAdId,
      source: item.source,
      sourceId: item.sourceId,
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
      savedAdId: item.savedAdId,
      source: item.source,
      sourceId: item.sourceId,
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

  const openBrandRemix = () => {
    if (!selectedAd) {
      return;
    }

    if (!remixSurface) {
      setActionError(translate('errors.remixUnavailable'));
      return;
    }

    setActionError(null);
    const snapshot = findSavedSnapshot(saved.savedAds, selectedAd);
    if (snapshot) {
      void remixSurface.openRemix({
        kind: 'saved_ad',
        savedAdId: snapshot.id,
      });
      return;
    }
    if (selectedAd.source === 'public') {
      void remixSurface.openRemix({
        adPerformanceId: selectedAd.id,
        kind: 'public_ad',
      });
      return;
    }

    if (
      !selectedAd.platform ||
      !selectedAd.credentialId ||
      !selectedAd.adAccountId
    ) {
      setActionError(
        'Choose the connected credential and ad account before remixing this ad.',
      );
      return;
    }

    void remixSurface.openRemix({
      adAccountId: selectedAd.adAccountId,
      adId: selectedAd.id,
      ...(selectedAd.channel ? { channel: selectedAd.channel } : {}),
      credentialId: selectedAd.credentialId,
      kind: 'connected_ad',
      ...(selectedAd.loginCustomerId
        ? { loginCustomerId: selectedAd.loginCustomerId }
        : {}),
      platform: selectedAd.platform,
    });
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
        campaignName: `${brandLabel} ${
          selectedAd.platform === 'meta'
            ? 'Meta'
            : selectedAd.platform === 'tiktok'
              ? 'TikTok'
              : selectedAd.platform === 'x'
                ? 'X'
                : 'Google'
        } Campaign`,
        createWorkflow: true,
        dailyBudget: 50,
      });

      setAdPackResult(result.adPack);
      setLaunchPrepResult(result);
      setWorkflowResult(
        result.workflowId
          ? {
              workflowId: result.workflowId,
              workflowName: result.workflowName || 'Ad launch plan',
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

  const toggleSaved = async (items: AdsResearchItem[]) => {
    if (items.length === 0) return;
    if (!brandId) {
      setActionError(translate('swipeFile.brandRequired'));
      return;
    }
    setActionError(null);
    try {
      const snapshots = items
        .map((item) =>
          saved.savedAds.find((snapshot) => snapshot.id === item.savedAdId),
        )
        .filter((item): item is ISavedAd => Boolean(item));
      if (snapshots.length === items.length) {
        await saved.unsave(snapshots);
        if (
          source === 'saved' &&
          selectedAd?.savedAdId &&
          snapshots.some((item) => item.id === selectedAd.savedAdId)
        ) {
          handleCloseDetail();
        }
        return;
      }

      const unsavedItems = items.filter((item) => !item.savedAdId);
      if (unsavedItems.length === 0) {
        setActionError(translate('swipeFile.staleSnapshot'));
        return;
      }
      await saved.save(
        unsavedItems.map((item) =>
          buildSaveAdInput(item, {
            adAccountId,
            brandId,
            credentialId,
            loginCustomerId,
          }),
        ),
      );
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : translate('swipeFile.updateFailed'),
      );
    }
  };

  const updateSavedNote = async (id: string, note: string) => {
    if (!brandId) return;
    setActionError(null);
    try {
      await saved.updateNotes([{ brandId, id, note }]);
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : translate('swipeFile.updateFailed'),
      );
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
    isLoading: source === 'saved' ? saved.isLoading : isLoading,
    launchPrepResult,
    metric,
    openBrandRemix,
    platform,
    refetch: source === 'saved' ? saved.refetch : refetch,
    results,
    resultsError,
    savedError: saved.error,
    savedMutating: saved.isMutating,
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
    toggleSaved,
    updateSavedNote,
    brandLabel,
    viewType,
    setViewType,
    workflowResult,
  };
}
