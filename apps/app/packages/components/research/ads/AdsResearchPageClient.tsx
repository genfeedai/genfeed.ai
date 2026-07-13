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
import Alert from '@ui/feedback/alert/Alert';
import Container from '@ui/layout/container/Container';
import ViewToggle from '@ui/navigation/view-toggle/ViewToggle';
import { Button } from '@ui/primitives/button';
import FormSearchbar from '@ui/primitives/searchbar';
import type { ChangeEvent } from 'react';
import {
  HiOutlineFunnel,
  HiOutlineMegaphone,
  HiTableCells,
  HiViewColumns,
} from 'react-icons/hi2';
import { AdsResearchAdGrid, AdsResearchAdTable } from './AdsResearchAdCards';
import { DetailSidebar } from './AdsResearchDetailSidebar';
import { AdsResearchFilterPanel } from './AdsResearchFilterPanel';
import { useAdsResearchPageClient } from './useAdsResearchPageClient';

const SORT_OPTIONS = [
  { label: 'Score (High → Low)', value: 'score' },
  { label: 'CTR (High → Low)', value: 'ctr' },
  { label: 'ROAS (High → Low)', value: 'roas' },
];

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

  return (
    <Container
      label="Ads Intelligence"
      description="Find winning ads, remix for your brand."
      headerTabs={{
        activeTab: initialPlatform,
        fullWidth: false,
        items: [
          {
            href: APP_ROUTES.RESEARCH.ADS,
            id: 'all',
            label: 'Overview',
            matchMode: 'exact',
          },
          { href: APP_ROUTES.RESEARCH.ADS_META, id: 'meta', label: 'Meta' },
          {
            href: APP_ROUTES.RESEARCH.ADS_GOOGLE,
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
            onChange={(_name, value) =>
              setSortKey(value as 'score' | 'ctr' | 'roas')
            }
            className="h-10 rounded-lg shadow-border bg-card px-3 text-white/80 hover:bg-white/[0.04] hover:text-white"
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
