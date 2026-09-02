'use client';

import { APP_ROUTES } from '@genfeedai/constants';
import {
  AlertCategory,
  ButtonSize,
  ButtonVariant,
  ComponentSize,
  ViewType,
} from '@genfeedai/enums';
import type { AdsResearchPlatform } from '@genfeedai/interfaces';
import { useResearchPagination } from '@pages/research/work-surface/ResearchWorkSurfaceProvider';
import ButtonDropdown from '@ui/buttons/dropdown/button-dropdown/ButtonDropdown';
import ButtonRefresh from '@ui/buttons/refresh/button-refresh/ButtonRefresh';
import CardEmpty from '@ui/card/empty/CardEmpty';
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Columns2,
  Eye,
  Funnel as Filter,
  Megaphone,
  Table,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { type ChangeEvent, useState } from 'react';

import { AdsResearchAdGrid, AdsResearchAdTable } from './AdsResearchAdCards';
import { DetailSidebar } from './AdsResearchDetailSidebar';
import { AdsResearchFilterPanel } from './AdsResearchFilterPanel';
import { AdsResearchWatchlistPanel } from './AdsResearchWatchlistPanel';
import {
  type AdSortKey,
  useAdsResearchPageClient,
} from './useAdsResearchPageClient';
import { useAdsResearchWatchlist } from './useAdsResearchWatchlist';
import XAdsDsaNotice from './XAdsDsaNotice';

const SORT_OPTIONS = [
  { label: 'Score (High → Low)', value: 'score' },
  { label: 'CTR (High → Low)', value: 'ctr' },
  { label: 'ROAS (High → Low)', value: 'roas' },
  // The only ranking axis competitor archive rows carry: no archive publishes
  // CTR or ROAS, but all of them publish how long an ad has been running.
  { label: 'Longest running', value: 'longevity' },
];

function CompactStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-2xs font-semibold uppercase tracking-[0.14em] text-foreground/40">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export default function AdsResearchPageClient() {
  const translate = useTranslations('pages.adsResearch');
  const {
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
    handleCloseDetail,
    handleSelectAd,
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
  const watchlist = useAdsResearchWatchlist();
  const [showWatchlist, setShowWatchlist] = useState(false);
  const { pageItems, pagination } = useResearchPagination(allAds);

  const hasCredentials = credentialOptions.length > 0;
  const hasAds = allAds.length > 0;
  // Brand Social is where Facebook + Google Ads OAuth connect live
  // (`BrandDetailSocialMediaCard`). `/settings/organization/credentials` never shipped.
  const credentialsHref = href(APP_ROUTES.SETTINGS.SOCIAL);
  /** Not set up at all — no ad platform connected and no public winners loaded. */
  const isSetupEmpty =
    source !== 'saved' && !isLoading && !hasCredentials && !hasAds;
  /**
   * Public research can still fill the list without a connected ad account.
   * When we have public ads only, keep the list and show a slim connect strip.
   */
  const showConnectStrip = source !== 'saved' && !hasCredentials && hasAds;
  const sourceLabel =
    source === 'saved'
      ? translate('swipeFile.saved')
      : results.summary.selectedSource === 'my_accounts'
        ? 'My accounts'
        : results.summary.selectedSource === 'public'
          ? 'Public'
          : 'All';

  // Setup empty = no credentials and no ads: hide chrome (tabs, view toggle,
  // refresh). Only the connect empty state should compete for attention.
  const headerRight = isSetupEmpty ? undefined : (
    <div className="flex items-center gap-2">
      <ViewToggle
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
      <ButtonRefresh
        isRefreshing={isLoading}
        onClick={() => {
          refetch();
        }}
      />
    </div>
  );

  return (
    <Container
      label="Ads"
      description="Find winning ads and remix for your brand."
      headerTabs={
        isSetupEmpty
          ? undefined
          : {
              activeTab: effectivePlatform,
              fullWidth: false,
              items: [
                { id: 'all', label: 'Overview' },
                { id: 'meta', label: 'Meta' },
                { id: 'google', label: 'Google + YouTube' },
                { id: 'tiktok', label: 'TikTok' },
                { id: 'x', label: 'X' },
              ],
              onTabChange: (value) =>
                setPlatform(value as AdsResearchPlatform | 'all'),
              variant: 'default',
            }
      }
      icon={Megaphone}
      right={headerRight}
    >
      {(resultsError || accountsError || detailError || savedError) && (
        <Alert type={AlertCategory.ERROR} className="mb-4">
          <div className="space-y-1">
            <div className="font-medium">{translate('errors.title')}</div>
            <div className="text-xs text-foreground/70">
              {detailError?.message ||
                (savedError instanceof Error
                  ? savedError.message
                  : undefined) ||
                accountsError?.message ||
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

      {isSetupEmpty ? (
        <CardEmpty
          icon={Megaphone}
          label="Connect Meta, Google/YouTube, TikTok, or X Ads"
          description="Meta uses Facebook OAuth; Google/YouTube Ads, TikTok Ads, and X Ads each need their ad credentials. Public winners can appear without a connection; your campaigns show after you connect and pick an ad account in Filters."
          actions={
            <Button
              asChild
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className="mt-1"
            >
              <Link href={credentialsHref}>
                {translate('actions.manageConnections')}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          {/* Search left · filters / sort / counts right */}
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="w-full sm:max-w-xs lg:max-w-sm">
              <FormSearchbar
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSearch(event.target.value)
                }
                onClear={() => setSearch('')}
                placeholder="Search ads"
                size={ComponentSize.MD}
                className="w-full"
              />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                variant={
                  showWatchlist ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
                }
                size={ButtonSize.SM}
                icon={<Eye className="size-4" />}
                onClick={() => setShowWatchlist(!showWatchlist)}
              >
                {translate('actions.watchCompetitors')}
              </Button>
              <Button
                variant={
                  showFilters ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
                }
                size={ButtonSize.SM}
                icon={<Filter className="size-4" />}
                onClick={() => setShowFilters(!showFilters)}
              >
                {translate('actions.filters')}
              </Button>
              <ButtonDropdown
                name="sort"
                value={sortKey}
                options={SORT_OPTIONS}
                onChange={(_name, value) => setSortKey(value as AdSortKey)}
                className="h-9 rounded-md bg-background-tertiary px-3 text-sm text-foreground shadow-border hover:bg-hover"
              />
              <div className="ml-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                {source === 'saved' ? (
                  <CompactStat
                    label={translate('swipeFile.saved')}
                    value={allAds.length}
                  />
                ) : (
                  <>
                    <CompactStat
                      label="Public"
                      value={results.summary.publicCount}
                    />
                    <CompactStat
                      label="Connected"
                      value={results.summary.connectedCount}
                    />
                  </>
                )}
                <CompactStat label="Source" value={sourceLabel} />
              </div>
            </div>
          </div>

          {showWatchlist ? (
            <AdsResearchWatchlistPanel
              advertisers={watchlist.advertisers}
              isAdding={watchlist.isAdding}
              isLoading={watchlist.isLoading}
              readiness={watchlist.readiness}
              onAdd={watchlist.addAdvertiser}
              onRemove={watchlist.removeAdvertiser}
              {...(watchlist.addError ? { addError: watchlist.addError } : {})}
              {...(watchlist.busyId ? { busyId: watchlist.busyId } : {})}
              {...(watchlist.loadError
                ? { loadError: watchlist.loadError }
                : {})}
            />
          ) : null}

          {showFilters ? (
            <AdsResearchFilterPanel
              adAccountId={adAccountId}
              adAccounts={adAccounts}
              channel={channel}
              credentialId={credentialId}
              credentialOptions={credentialOptions}
              effectivePlatform={effectivePlatform}
              industry={industry}
              loginCustomerId={loginCustomerId}
              metric={metric}
              showChannelFilter={showChannelFilter}
              source={source}
              timeframe={timeframe}
              onAdAccountChange={setAdAccountId}
              onChannelChange={setChannel}
              onCredentialChange={setCredentialId}
              onIndustryChange={setIndustry}
              onLoginCustomerIdChange={setLoginCustomerId}
              onMetricChange={setMetric}
              onSourceChange={setSource}
              onTimeframeChange={setTimeframe}
            />
          ) : null}

          {effectivePlatform === 'x' ? <XAdsDsaNotice /> : null}

          {showConnectStrip ? (
            <Alert type={AlertCategory.INFO} className="mb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="font-medium">
                    {translate('connection.title')}
                  </div>
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
            <p className="mb-4 text-xs text-foreground/45">
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
        </>
      )}

      {selectedAd ? (
        <DetailSidebar
          detail={detail ?? null}
          detailLoading={detailLoading}
          href={href}
          selectedAd={selectedAd}
          onClose={handleCloseDetail}
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
    </Container>
  );
}
