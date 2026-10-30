'use client';

import { ContextSidebarPanel } from '@contexts/ui/context-sidebar-context';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ViewType,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { AdsChannel, AdsPlatform } from '@genfeedai/contracts/interfaces';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import SearchField from '@ui/content/search-field/SearchField';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import ViewMenu from '@ui/navigation/view-menu/ViewMenu';
import { Button } from '@ui/primitives/button';
import { Columns2, Eye, Megaphone, Table } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useResearchPagination } from '@/features/research/work-surface/ResearchWorkSurfaceProvider';

import AdsPublicDiscoveryPanel from './AdsPublicDiscoveryPanel';
import { AdsResearchAdGrid, AdsResearchAdTable } from './AdsResearchAdCards';
import { DetailSidebar } from './AdsResearchDetailSidebar';
import {
  AdsResearchFilterMenu,
  AdsResearchTextFilters,
} from './AdsResearchFilterMenu';
import { AdsResearchWatchlistPanel } from './AdsResearchWatchlistPanel';
import { useAdsResearchPageClient } from './useAdsResearchPageClient';
import { useAdsResearchWatchlist } from './useAdsResearchWatchlist';
import XAdsDsaNotice from './XAdsDsaNotice';

export default function AdsResearchPageClient() {
  const translate = useTranslations('pages.adsResearch');
  const {
    adAccounts,
    adPackResult,
    actionError,
    allAds,
    busyAction,
    credentialOptions,
    credentialsError,
    isConnectionStateReady,
    isReady,
    detail,
    detailError,
    detailLoading,
    effectivePlatform,
    handleCloseDetail,
    handleSelectAd,
    selectedAdOrigin,
    href,
    isLoading,
    launchPrepResult,
    metric,
    openBrandRemix,
    refetch,
    results,
    resultsError,
    savedError,
    savedMutating,
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
    setSource,
    setSortKey,
    setTimeframe,
    showChannelFilter,
    sortKey,
    source,
    adAccountId,
    channel,
    credentialId,
    industry,
    loginCustomerId,
    timeframe,
    toggleSaved,
    updateSavedNote,
    brandLabel,
    workflowResult,
    viewType,
    setViewType,
  } = useAdsResearchPageClient();
  // Called after the research hook so the ads queries keep their identity;
  // the watchlist is an independent concern layered on the same page.
  const watchlist = useAdsResearchWatchlist(refetch);
  const [showWatchlist, setShowWatchlist] = useState<boolean>();
  const { pageItems, pagination } = useResearchPagination(allAds);

  const hasCredentials = credentialOptions.length > 0;
  const credentialsHref = href(APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS);
  const showConnectStrip =
    source === 'my_accounts' &&
    !isLoading &&
    isConnectionStateReady &&
    !hasCredentials &&
    !resultsError &&
    !accountsError;
  const connectionError =
    source === 'my_accounts' && !hasCredentials ? credentialsError : null;
  const isWatchlistVisible =
    showWatchlist ??
    (isReady &&
      source !== 'saved' &&
      source !== 'my_accounts' &&
      !isLoading &&
      !resultsError &&
      results.summary.publicCount === 0);
  const headerRight = (
    <div className="flex items-center gap-2">
      <Button
        variant={
          isWatchlistVisible ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
        }
        size={ButtonSize.SM}
        icon={<Eye className="size-4" />}
        onClick={() => setShowWatchlist(!isWatchlistVisible)}
      >
        {translate('actions.watchCompetitors')}
      </Button>
      <ViewMenu
        options={[
          {
            icon: <Columns2 className="size-4" />,
            label: 'Grid view',
            type: ViewType.GRID,
          },
          {
            icon: <Table className="size-4" />,
            label: 'Table view',
            type: ViewType.TABLE,
          },
        ]}
        activeView={viewType}
        onChange={setViewType}
      />
    </div>
  );

  const adsSearch = (
    <SearchField onSearch={setSearch} placeholder="Search ads" value={search}>
      <AdsResearchFilterMenu
        isAttached
        adAccountId={adAccountId}
        adAccounts={adAccounts}
        channel={channel}
        connectedCount={results.summary.connectedCount}
        credentialId={credentialId}
        credentialOptions={credentialOptions}
        metric={metric}
        onAdAccountChange={setAdAccountId}
        onChannelChange={setChannel}
        onClear={() => {
          setPlatform('all');
          setSource('all');
          setSortKey('score');
          setMetric('performanceScore');
          setTimeframe('last_30_days');
          setChannel(AdsChannel.ALL);
          setCredentialId('');
          setAdAccountId('');
        }}
        onCredentialChange={setCredentialId}
        onMetricChange={setMetric}
        onPlatformChange={setPlatform}
        onSortChange={setSortKey}
        onSourceChange={setSource}
        onTimeframeChange={setTimeframe}
        platform={effectivePlatform}
        publicCount={results.summary.publicCount}
        showChannelFilter={showChannelFilter}
        sortKey={sortKey}
        source={source}
        timeframe={timeframe}
      />
    </SearchField>
  );

  const headerRefresh = (
    <ButtonRefresh
      isRefreshing={isLoading}
      onClick={() => {
        refetch();
      }}
    />
  );

  return (
    <Container
      label="Ads"
      leading={adsSearch}
      icon={Megaphone}
      refresh={headerRefresh}
      right={headerRight}
    >
      {(resultsError ||
        accountsError ||
        connectionError ||
        detailError ||
        savedError) && (
        <Alert type={AlertCategory.ERROR} className="mb-4">
          <div className="space-y-1">
            <div className="font-medium">{translate('errors.title')}</div>
            <div className="text-xs text-foreground/70">
              {detailError?.message ||
                (savedError instanceof Error
                  ? savedError.message
                  : undefined) ||
                accountsError?.message ||
                connectionError?.message ||
                resultsError?.message ||
                'Try refreshing the page.'}
            </div>
          </div>
        </Alert>
      )}

      {actionError && !selectedAd ? (
        <Alert type={AlertCategory.ERROR} className="mb-4">
          <div className="text-xs">{actionError}</div>
        </Alert>
      ) : null}

      <AdsResearchTextFilters
        effectivePlatform={effectivePlatform}
        industry={industry}
        loginCustomerId={loginCustomerId}
        onIndustryChange={setIndustry}
        onLoginCustomerIdChange={setLoginCustomerId}
        source={source}
      />

      {source === 'all' || source === 'public' ? (
        <AdsPublicDiscoveryPanel
          watchError={watchlist.addError}
          onWatch={watchlist.addAdvertiser}
          isWatching={watchlist.isAdding}
        />
      ) : null}

      {isWatchlistVisible ? (
        <AdsResearchWatchlistPanel
          advertisers={watchlist.advertisers}
          isAdding={watchlist.isAdding}
          isLoading={watchlist.isLoading}
          readiness={watchlist.readiness}
          onAdd={watchlist.addAdvertiser}
          onPoll={watchlist.pollAdvertiser}
          onRemove={watchlist.removeAdvertiser}
          {...(watchlist.addError ? { addError: watchlist.addError } : {})}
          {...(watchlist.busyId ? { busyId: watchlist.busyId } : {})}
          {...(watchlist.loadError ? { loadError: watchlist.loadError } : {})}
        />
      ) : null}

      {effectivePlatform === AdsPlatform.X ? <XAdsDsaNotice /> : null}

      {showConnectStrip ? (
        <Alert type={AlertCategory.INFO} className="mb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="font-medium">{translate('connection.title')}</div>
              <div className="text-xs text-foreground/70">
                {translate('connection.description')}
              </div>
            </div>
            <Button
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.SM}
              className="shrink-0"
            >
              <Link href={credentialsHref}>
                {translate('actions.manageConnections')}
              </Link>
            </Button>
          </div>
        </Alert>
      ) : null}

      {hasCredentials && results.summary.reviewPolicy ? (
        <p className="mb-4 text-xs text-muted-foreground">
          {translate('reviewPolicy')}
        </p>
      ) : null}

      {viewType === ViewType.GRID ? (
        <AdsResearchAdGrid
          ads={[...pageItems]}
          isSavedView={source === 'saved'}
          isLoading={isLoading}
          metric={metric}
          search={search}
          selectedKey={selectedKey}
          onSelect={handleSelectAd}
          onToggleSaved={toggleSaved}
          savedMutating={savedMutating}
        />
      ) : (
        <AdsResearchAdTable
          ads={[...pageItems]}
          isSavedView={source === 'saved'}
          metric={metric}
          search={search}
          selectedKey={selectedKey}
          onSelect={handleSelectAd}
          onToggleSaved={toggleSaved}
          savedMutating={savedMutating}
        />
      )}
      {pagination ? <div className="mt-5">{pagination}</div> : null}
      <ContextSidebarPanel
        onClose={handleCloseDetail}
        selection={
          selectedAd && selectedKey
            ? {
                id: selectedKey,
                kind: 'finding',
                origin: selectedAdOrigin,
                subtitle: detail?.title,
                title: translate('detail.title'),
              }
            : null
        }
      >
        {selectedAd ? (
          <DetailSidebar
            detail={detail ?? null}
            detailLoading={detailLoading}
            href={href}
            selectedAd={selectedAd}
            onOpenRemix={openBrandRemix}
            onToggleSaved={toggleSaved}
            onUpdateSavedNote={updateSavedNote}
            savedMutating={savedMutating}
            onRunAction={runAction}
            busyAction={busyAction}
            actionError={actionError}
            adPackResult={adPackResult}
            launchPrepResult={launchPrepResult}
            workflowResult={workflowResult}
            brandLabel={brandLabel}
          />
        ) : null}
      </ContextSidebarPanel>
    </Container>
  );
}
