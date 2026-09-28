import {
  AnalyticsProvider,
  useAnalyticsContext,
} from '@contexts/analytics/analytics-context';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  getBrandEntityId,
  getBrandOrganizationId,
} from '@contexts/user/brand-context/brand-context.helpers';
import { useAgentChatStore } from '@genfeedai/agent';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type {
  AnalyticsQueryFilterKey,
  AnalyticsQueryReference,
} from '@genfeedai/contracts/interfaces';
import type { DateRange } from '@genfeedai/contracts/interfaces/utils/date.interface';
import { formatApiDate } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useExportModal } from '@providers/global-modals/global-modals.provider';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { Download, LinkIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import {
  type AnalyticsWorkspaceSurfaceAdapterState,
  useAnalyticsWorkspaceSurfaceAdapter,
} from '@/features/analytics/work-surface/analytics-workspace-surface-adapter-context';
import {
  ANALYTICS_DATE_SEARCH_KEYS,
  ANALYTICS_FILTER_SEARCH_KEYS,
  buildAnalyticsQueryReference,
  type RestoredAnalyticsSurfaceState,
  restoreAnalyticsSurfaceState,
} from './analytics-work-surface-state';

/** Opens the export for the visible query, or `null` when none applies. */
const AnalyticsScopedExportContext = createContext<(() => void) | null>(null);

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
      className="ml-2 inline-flex max-w-56 items-center gap-1.5 rounded-md border border-border bg-background px-2 py-1 text-2xs text-foreground/78"
      data-testid="analytics-composer-query-reference"
      title={`${reference.route} · ${reference.dateRange.startDate} to ${reference.dateRange.endDate}`}
    >
      <LinkIcon aria-hidden="true" className="size-3.5 shrink-0" />
      <span className="truncate">Visible analytics query</span>
    </span>
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
  const { brands, organizationId } = useBrand();
  const { openExport } = useExportModal();
  const translateExport = useTranslations('pages.analytics.scopedExport');
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
  // The route's own brand (`/analytics/brands/:id` and its
  // `/platforms/:platform` child), authorized against this organization, so
  // the shell can rebind the open thread to it.
  const routeBrandId = restoredState.routeBrandId;
  const routeBrand = useMemo(
    () =>
      routeBrandId
        ? brands.find(
            (brand) =>
              getBrandEntityId(brand) === routeBrandId &&
              getBrandOrganizationId(brand) === organizationId,
          )
        : undefined,
    [brands, organizationId, routeBrandId],
  );

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
        NotificationsService.getInstance().success(translateExport('success'));
      } catch (error) {
        logger.error('Scoped analytics export failed', { error });
        NotificationsService.getInstance().error(translateExport('error'));
      }
    },
    [getAnalyticsService, queryReference, translateExport],
  );
  const handleOpenExport = useCallback(() => {
    openExport({ onExport: handleExport });
  }, [handleExport, openExport]);
  const adapter = useMemo<AnalyticsWorkspaceSurfaceAdapterState>(
    () => ({
      ...(routeBrand ? { brandId: getBrandEntityId(routeBrand) } : {}),
      composerContext: queryReference ? (
        <AnalyticsComposerQueryChip reference={queryReference} />
      ) : null,
      contextLabel: `Canvas · ${restoredState.descriptor.label}`,
      key: `analytics:${restoredState.normalizedRoute}`,
      surfaceKey: 'analytics',
    }),
    [queryReference, restoredState, routeBrand],
  );
  useAnalyticsWorkspaceSurfaceAdapter(adapter);

  const isExportAvailable =
    queryReference?.provenance.source === 'genfeed-analytics-api' &&
    restoredState.descriptor.exportKind === 'published-posts';
  const scopedExport = useMemo(
    () => (isExportAvailable ? handleOpenExport : null),
    [handleOpenExport, isExportAvailable],
  );

  return (
    <AnalyticsScopedExportContext value={scopedExport}>
      {children}
    </AnalyticsScopedExportContext>
  );
}

/**
 * Exports exactly the query the page shows. Lives in the analytics toolbar;
 * renders nothing where the visible data has no authoritative export.
 */
export function AnalyticsScopedExportButton() {
  const translate = useTranslations('pages.analytics.scopedExport');
  const openScopedExport = use(AnalyticsScopedExportContext);

  if (!openScopedExport) {
    return null;
  }

  return (
    <Button
      icon={<Download aria-hidden="true" className="size-4" />}
      onClick={openScopedExport}
      size={ButtonSize.SM}
      variant={ButtonVariant.SECONDARY}
      withWrapper={false}
    >
      {translate('label')}
    </Button>
  );
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
