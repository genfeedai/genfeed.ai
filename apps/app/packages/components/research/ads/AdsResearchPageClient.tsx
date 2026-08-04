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
import { Columns2, Funnel as Filter, Megaphone, Table } from 'lucide-react';
import Link from 'next/link';
import type { ChangeEvent } from 'react';

import { AdsResearchAdGrid, AdsResearchAdTable } from './AdsResearchAdCards';
import { DetailSidebar } from './AdsResearchDetailSidebar';
import { AdsResearchFilterPanel } from './AdsResearchFilterPanel';
import { useAdsResearchPageClient } from './useAdsResearchPageClient';

const SORT_OPTIONS = [
  { label: 'Score (High → Low)', value: 'score' },
  { label: 'CTR (High → Low)', value: 'ctr' },
  { label: 'ROAS (High → Low)', value: 'roas' },
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
      <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/40">
        {label}
      </span>
      <span className="text-sm font-semibold tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export default function AdsResearchPageClient({
  initialPlatform = 'all',
}: {
  initialPlatform?: AdsResearchPlatform | 'all';
}) {
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
    industry,
    loginCustomerId,
    timeframe,
    brandLabel,
    workflowResult,
    viewType,
    setViewType,
  } = useAdsResearchPageClient(initialPlatform);
  const { pageItems, pagination } = useResearchPagination(allAds);

  const hasCredentials = credentialOptions.length > 0;
  const hasAds = allAds.length > 0;
  // Brand Social is where Facebook + Google Ads OAuth connect live
  // (`BrandDetailSocialMediaCard`). `/settings/organization/credentials` never shipped.
  const credentialsHref = href(APP_ROUTES.SETTINGS.SOCIAL);
  /** Not set up at all — no Meta/Google connection and no public winners loaded. */
  const isSetupEmpty = !isLoading && !hasCredentials && !hasAds;
  /**
   * Public research can still fill the list without a connected ad account.
   * When we have public ads only, keep the list and show a slim connect strip.
   */
  const showConnectStrip = !hasCredentials && hasAds;
  const sourceLabel =
    results.summary.selectedSource === 'my_accounts'
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
              activeTab: initialPlatform,
              fullWidth: false,
              items: [
                {
                  href: APP_ROUTES.DISCOVER.ADS,
                  id: 'all',
                  label: 'Overview',
                  matchMode: 'exact',
                },
                {
                  href: APP_ROUTES.DISCOVER.ADS_META,
                  id: 'meta',
                  label: 'Meta',
                },
                {
                  href: APP_ROUTES.DISCOVER.ADS_GOOGLE,
                  id: 'google',
                  label: 'Google + YouTube',
                },
              ],
              variant: 'default',
            }
      }
      icon={Megaphone}
      right={headerRight}
    >
      {(resultsError || accountsError || detailError) && (
        <Alert type={AlertCategory.ERROR} className="mb-4">
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

      {isSetupEmpty ? (
        <CardEmpty
          icon={Megaphone}
          label="Connect Meta or Google Ads"
          description="Meta uses your Facebook connection; Google Ads is its own OAuth. Public winners can appear without a connection, but your campaigns only show after you connect and pick an ad account in Filters."
          actions={
            <Button
              asChild
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.SM}
              className="mt-1"
            >
              <Link href={credentialsHref}>Manage ad connections</Link>
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
                  showFilters ? ButtonVariant.SECONDARY : ButtonVariant.GHOST
                }
                size={ButtonSize.SM}
                icon={<Filter className="size-4" />}
                onClick={() => setShowFilters(!showFilters)}
              >
                Filters
              </Button>
              <ButtonDropdown
                name="sort"
                value={sortKey}
                options={SORT_OPTIONS}
                onChange={(_name, value) =>
                  setSortKey(value as 'score' | 'ctr' | 'roas')
                }
                className="h-9 rounded-lg shadow-border bg-card px-3 text-sm text-white/80 hover:bg-white/[0.04] hover:text-white"
              />
              <div className="ml-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                <CompactStat
                  label="Public"
                  value={results.summary.publicCount}
                />
                <CompactStat
                  label="Connected"
                  value={results.summary.connectedCount}
                />
                <CompactStat label="Source" value={sourceLabel} />
              </div>
            </div>
          </div>

          {showFilters ? (
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
          ) : null}

          {showConnectStrip ? (
            <Alert type={AlertCategory.INFO} className="mb-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <div className="font-medium">
                    Connect accounts for your campaigns
                  </div>
                  <div className="text-xs text-foreground/70">
                    Showing public winners only. Connect Meta or Google Ads to
                    pull in your own campaigns.
                  </div>
                </div>
                <Button
                  asChild
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.SM}
                  className="shrink-0"
                >
                  <Link href={credentialsHref}>Manage ad connections</Link>
                </Button>
              </div>
            </Alert>
          ) : null}

          {hasCredentials && results.summary.reviewPolicy ? (
            <p className="mb-4 text-xs text-foreground/45">
              {results.summary.reviewPolicy}
            </p>
          ) : null}

          {viewType === ViewType.GRID ? (
            <AdsResearchAdGrid
              ads={[...pageItems]}
              isLoading={isLoading}
              metric={metric}
              search={search}
              selectedKey={selectedKey}
              onSelect={handleSelectAd}
            />
          ) : (
            <AdsResearchAdTable
              ads={[...pageItems]}
              metric={metric}
              search={search}
              selectedKey={selectedKey}
              onSelect={handleSelectAd}
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
