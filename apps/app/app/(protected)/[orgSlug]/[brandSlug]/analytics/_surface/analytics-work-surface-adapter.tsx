'use client';

import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { useAgentChatStore } from '@genfeedai/agent';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import type {
  AnalyticsQueryFilterKey,
  AnalyticsQueryReference,
} from '@genfeedai/interfaces';
import type { DateRange } from '@genfeedai/interfaces/utils/date.interface';
import { formatApiDate } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { useExportModal } from '@providers/global-modals/global-modals.provider';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react';
import {
  HiArrowDownTray,
  HiArrowTopRightOnSquare,
  HiLink,
} from 'react-icons/hi2';
import {
  type AnalyticsWorkspaceSurfaceAdapterState,
  useAnalyticsWorkspaceSurfaceAdapter,
} from '@/features/analytics/work-surface/analytics-workspace-surface-adapter-context';
import {
  ANALYTICS_DATE_SEARCH_KEYS,
  ANALYTICS_FILTER_SEARCH_KEYS,
  ANALYTICS_METRIC_DEFINITIONS,
  buildAnalyticsQueryReference,
  buildCanonicalAnalyticsHref,
  type RestoredAnalyticsSurfaceState,
  restoreAnalyticsSurfaceState,
} from './analytics-work-surface-state';

function buildHref(pathname: string, searchParams: URLSearchParams): string {
  const query = searchParams.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function downloadAnalyticsExport(
  data: ArrayBuffer,
  format: 'csv' | 'xlsx',
): void {
  const blob = new Blob([data], {
    type:
      format === 'csv'
        ? 'text/csv'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `analytics-export.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(downloadUrl);
}

function AnalyticsComposerQueryChip({
  reference,
}: {
  readonly reference: AnalyticsQueryReference;
}) {
  return (
    <span
      className="ml-2 inline-flex max-w-56 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-[10px] text-foreground/78"
      data-testid="analytics-composer-query-reference"
      title={`${reference.route} · ${reference.dateRange.startDate} to ${reference.dateRange.endDate}`}
    >
      <HiLink aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">Visible analytics query</span>
    </span>
  );
}

function AnalyticsInspector({
  canonicalHref,
  onOpenExport,
  reference,
  restoredState,
  scopeLabel,
}: {
  readonly canonicalHref: string;
  readonly onOpenExport: () => void;
  readonly reference: AnalyticsQueryReference | null;
  readonly restoredState: RestoredAnalyticsSurfaceState;
  readonly scopeLabel: string;
}) {
  const visibleQueryId = useId();
  const metricDefinitionsId = useId();
  const provenanceId = useId();
  const { descriptor } = restoredState;
  const filterEntries = reference
    ? Object.entries(reference.filters).filter((entry) => Boolean(entry[1]))
    : [];
  const isExportAvailable =
    reference?.provenance.source === 'genfeed-analytics-api' &&
    descriptor.exportKind === 'published-posts';

  return (
    <div className="space-y-4" data-testid="analytics-context-inspector">
      <section
        aria-labelledby={visibleQueryId}
        className="gen-shell-empty-state space-y-3 p-4"
      >
        <div>
          <h3
            className="text-sm font-medium text-foreground"
            id={visibleQueryId}
          >
            Visible query
          </h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Server-hydrated Analytics data remains authoritative.
          </p>
        </div>
        <dl className="space-y-2 text-xs">
          <div>
            <dt className="text-muted-foreground">Scope</dt>
            <dd className="mt-0.5 break-words text-foreground/86">
              {scopeLabel}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date range</dt>
            <dd className="mt-0.5 text-foreground/86">
              {restoredState.dateRangeKeys.startDate} —{' '}
              {restoredState.dateRangeKeys.endDate}
            </dd>
          </div>
          {filterEntries.length > 0 ? (
            <div>
              <dt className="text-muted-foreground">Active filters</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {filterEntries.map(([key, value]) => (
                  <span
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-foreground/82"
                    key={key}
                  >
                    {key}: {value}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          {reference?.selectedResource ? (
            <div>
              <dt className="text-muted-foreground">Selected resource</dt>
              <dd className="mt-0.5 break-all text-foreground/86">
                {reference.selectedResource.kind}:
                {reference.selectedResource.id}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby={metricDefinitionsId} className="space-y-2">
        <h3
          className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground"
          id={metricDefinitionsId}
        >
          Metric definitions
        </h3>
        <dl className="space-y-2">
          {descriptor.metrics.map((metric) => (
            <div className="border-l border-border pl-3" key={metric}>
              <dt className="text-xs font-medium text-foreground">{metric}</dt>
              <dd className="mt-0.5 text-xs leading-5 text-muted-foreground">
                {ANALYTICS_METRIC_DEFINITIONS[metric]}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section
        aria-labelledby={provenanceId}
        className="space-y-2 border-t border-border pt-4"
      >
        <h3 className="text-xs font-medium text-foreground" id={provenanceId}>
          Provenance
        </h3>
        <p className="text-xs leading-5 text-muted-foreground">
          {reference?.provenance.source ?? 'Resolving scoped source'} · cached
          for up to {descriptor.cacheMinutes} minutes · visible results bounded
          to {descriptor.maxVisibleResults.toLocaleString()} items.
        </p>
        {isExportAvailable ? (
          <p className="text-xs leading-5 text-muted-foreground">
            Exports preserve the active server scope and are capped at 5,000
            published rows.
          </p>
        ) : null}
        <p
          className="rounded border border-warning/30 bg-warning/5 p-2 text-xs leading-5 text-warning"
          data-testid="analytics-derivative-summary-notice"
        >
          Agent summaries are derivative and non-authoritative. Verify numbers
          against the visible dashboard or an export.
        </p>
      </section>

      <div className="grid gap-2">
        {isExportAvailable ? (
          <Button
            icon={<HiArrowDownTray aria-hidden="true" className="size-4" />}
            onClick={onOpenExport}
            size={ButtonSize.SM}
            variant={ButtonVariant.OUTLINE}
            withWrapper={false}
          >
            Export scoped data
          </Button>
        ) : null}
        <Button
          asChild
          size={ButtonSize.SM}
          variant={ButtonVariant.GHOST}
          withWrapper={false}
        >
          <Link
            aria-label="Open canonical Analytics route in a new tab"
            href={canonicalHref}
            target="_blank"
            rel="noreferrer"
          >
            <HiArrowTopRightOnSquare aria-hidden="true" className="size-4" />
            Open canonical route
          </Link>
        </Button>
      </div>
    </div>
  );
}

function AnalyticsWorkSurfaceBridge({
  children,
  pathname,
  restoredState,
}: {
  readonly children: ReactNode;
  readonly pathname: string;
  readonly restoredState: RestoredAnalyticsSurfaceState;
}) {
  const { brandId, dateRange, filters } = useAnalyticsContext();
  const { organizationId } = useBrand();
  const { brandSlug, orgSlug } = useOrgUrl();
  const { openExport } = useExportModal();
  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );
  const setPageContext = useAgentChatStore((state) => state.setPageContext);
  const queryReference = useMemo(
    () =>
      organizationId && dateRange.startDate && dateRange.endDate
        ? buildAnalyticsQueryReference({
            brandId,
            dateRange: {
              endDate: formatApiDate(dateRange.endDate),
              startDate: formatApiDate(dateRange.startDate),
            },
            descriptor: restoredState.descriptor,
            filters,
            normalizedRoute: restoredState.normalizedRoute,
            organizationId,
            selectedResource: restoredState.selectedResource,
          })
        : null,
    [
      brandId,
      dateRange.endDate,
      dateRange.startDate,
      filters,
      organizationId,
      restoredState.descriptor,
      restoredState.normalizedRoute,
      restoredState.selectedResource,
    ],
  );
  const canonicalHref = useMemo(
    () =>
      buildCanonicalAnalyticsHref(
        pathname,
        restoredState.canonicalSearchParams,
      ),
    [pathname, restoredState.canonicalSearchParams],
  );
  const scopeLabel = `${orgSlug || 'organization'} / ${brandSlug || 'brand'}`;

  useEffect(() => {
    if (!queryReference) {
      return;
    }
    const currentContext = useAgentChatStore.getState().pageContext;
    setPageContext({
      ...(currentContext?.route === pathname ? currentContext : {}),
      analyticsQuery: queryReference,
      route: pathname,
      suggestedActions: currentContext?.suggestedActions ?? [],
    });

    return () => {
      const latestContext = useAgentChatStore.getState().pageContext;
      if (latestContext?.analyticsQuery?.id !== queryReference.id) {
        return;
      }
      const { analyticsQuery: _analyticsQuery, ...rest } = latestContext;
      setPageContext(rest);
    };
  }, [pathname, queryReference, setPageContext]);

  const handleExport = useCallback(
    async (format: 'csv' | 'xlsx', fields: string[]) => {
      if (!queryReference) {
        return;
      }
      try {
        const service = await getAnalyticsService();
        const data = await service.exportData(format, fields, {
          brand: queryReference.brandId,
          endDate: queryReference.dateRange.endDate,
          organization: queryReference.organizationId,
          platform: queryReference.filters.platform,
          postId: queryReference.filters.postId,
          startDate: queryReference.dateRange.startDate,
        });
        downloadAnalyticsExport(data, format);
        NotificationsService.getInstance().success('Scoped analytics exported');
      } catch (error) {
        logger.error('Scoped analytics export failed', { error });
        NotificationsService.getInstance().error('Analytics export');
      }
    },
    [getAnalyticsService, queryReference],
  );
  const handleOpenExport = useCallback(() => {
    openExport({ onExport: handleExport });
  }, [handleExport, openExport]);
  const adapter = useMemo<AnalyticsWorkspaceSurfaceAdapterState>(
    () => ({
      composerContext: queryReference ? (
        <AnalyticsComposerQueryChip reference={queryReference} />
      ) : null,
      contextLabel: `Canvas · ${restoredState.descriptor.label}`,
      inspectorContent: (
        <AnalyticsInspector
          canonicalHref={canonicalHref}
          onOpenExport={handleOpenExport}
          reference={queryReference}
          restoredState={restoredState}
          scopeLabel={scopeLabel}
        />
      ),
      key: `analytics:${restoredState.normalizedRoute}`,
      surfaceKey: 'analytics',
    }),
    [
      canonicalHref,
      handleOpenExport,
      queryReference,
      restoredState,
      scopeLabel,
    ],
  );
  useAnalyticsWorkspaceSurfaceAdapter(adapter);

  return children;
}

export default function AnalyticsWorkSurfaceAdapter({
  children,
}: {
  readonly children: ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const { replace } = useRouter();
  const restoredState = useMemo(
    () =>
      restoreAnalyticsSurfaceState({
        pathname,
        searchParams: new URLSearchParams(searchParamsString),
      }),
    [pathname, searchParamsString],
  );
  const pendingSearchParamsRef = useRef(
    new URLSearchParams(restoredState.canonicalSearchParams),
  );

  useEffect(() => {
    pendingSearchParamsRef.current = new URLSearchParams(
      restoredState.canonicalSearchParams,
    );
    if (!restoredState.isCanonical) {
      replace(buildHref(pathname, restoredState.canonicalSearchParams));
    }
  }, [
    pathname,
    replace,
    restoredState.canonicalSearchParams,
    restoredState.isCanonical,
  ]);

  const handleDateRangeChange = useCallback(
    (dateRange: DateRange) => {
      if (!dateRange.startDate || !dateRange.endDate) {
        return;
      }
      const nextSearchParams = new URLSearchParams(
        pendingSearchParamsRef.current,
      );
      nextSearchParams.set(
        ANALYTICS_DATE_SEARCH_KEYS.startDate,
        formatApiDate(dateRange.startDate),
      );
      nextSearchParams.set(
        ANALYTICS_DATE_SEARCH_KEYS.endDate,
        formatApiDate(dateRange.endDate),
      );
      pendingSearchParamsRef.current = nextSearchParams;
      replace(buildHref(pathname, nextSearchParams));
    },
    [pathname, replace],
  );
  const handleFilterChange = useCallback(
    (key: AnalyticsQueryFilterKey, value?: string) => {
      const nextSearchParams = new URLSearchParams(
        pendingSearchParamsRef.current,
      );
      const searchKey = ANALYTICS_FILTER_SEARCH_KEYS[key];
      if (value) {
        nextSearchParams.set(searchKey, value);
      } else {
        nextSearchParams.delete(searchKey);
      }
      pendingSearchParamsRef.current = nextSearchParams;
      replace(buildHref(pathname, nextSearchParams));
    },
    [pathname, replace],
  );

  return (
    <AnalyticsProvider
      onDateRangeChange={handleDateRangeChange}
      onFilterChange={handleFilterChange}
      restoredDateRange={restoredState.dateRange}
      restoredFilters={restoredState.filters}
      syncWithBrandContext
    >
      <AnalyticsWorkSurfaceBridge
        pathname={pathname}
        restoredState={restoredState}
      >
        {children}
      </AnalyticsWorkSurfaceBridge>
    </AnalyticsProvider>
  );
}
