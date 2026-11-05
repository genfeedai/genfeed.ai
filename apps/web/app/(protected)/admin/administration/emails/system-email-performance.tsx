'use client';
import { ButtonVariant } from '@genfeedai/contracts';
import { LIFECYCLE_SYSTEM_EMAILS } from '@genfeedai/contracts/constants';
import type {
  IEmailPerformanceQuery,
  IEmailPerformanceRow,
} from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminSystemEmailsService } from '@services/admin/system-emails.service';
import { logger } from '@services/core/logger.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Table from '@ui/display/table/Table';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';

const TEMPLATE_NAMES = new Map(
  LIFECYCLE_SYSTEM_EMAILS.map((email) => [email.id as string, email.name]),
);

const NUMERIC_CELL = 'text-right tabular-nums';

const SYSTEM_EMAIL_PERFORMANCE_KEY = ['admin', 'system-emails', 'performance'];

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

function RateCaption({ label }: { label: string }) {
  return (
    <span className="block text-xs font-normal normal-case text-muted-foreground">
      {label}
    </span>
  );
}

/** Share of provider-accepted messages; blank when nothing was accepted. */
function Rate({
  numerator,
  denominator,
}: {
  numerator: number;
  denominator: number;
}) {
  if (denominator <= 0) {
    return null;
  }

  return (
    <span className="block text-xs text-muted-foreground">
      {`${((numerator / denominator) * 100).toFixed(1)}%`}
    </span>
  );
}

export default function SystemEmailPerformance({
  query,
}: {
  query: IEmailPerformanceQuery;
}) {
  const translate = useTranslations('pages.systemEmailPerformance');
  // Cached per cohort: coming back paints the report at once while it
  // refreshes, and a new date range keeps the current rows until it loads.
  const reportQuery = useAuthedQuery({
    keepPreviousDataWithin: SYSTEM_EMAIL_PERFORMANCE_KEY,
    queryFn: async (service, signal) => {
      try {
        return await service.getPerformance(query, signal);
      } catch (error) {
        if (!signal.aborted) {
          logger.error('Failed to load system email performance', error);
        }
        throw error;
      }
    },
    queryKey: [...SYSTEM_EMAIL_PERFORMANCE_KEY, query],
    service: (token: string) => AdminSystemEmailsService.getInstance(token),
  });
  const report = reportQuery.data ?? null;
  // A failed refresh keeps the report on screen; the error state is only for
  // a cohort that has no report yet.
  const state: 'loading' | 'ready' | 'error' = report
    ? 'ready'
    : reportQuery.isError
      ? 'error'
      : 'loading';
  const loadReport = () => reportQuery.refetch();

  const rateHeader = (label: string) => (
    <>
      {label}
      <RateCaption label={translate('rateCaption')} />
    </>
  );
  const countColumn = (
    key: keyof IEmailPerformanceRow,
    header: ReactNode,
    rateOf?: 'delivered' | 'clicked' | 'converted',
  ): TableColumn<IEmailPerformanceRow> => ({
    className: NUMERIC_CELL,
    header,
    key,
    render: (row) => (
      <>
        {formatCount(row[key] as number)}
        {rateOf ? (
          <Rate numerator={row[rateOf]} denominator={row.accepted} />
        ) : null}
      </>
    ),
  });
  const columns: TableColumn<IEmailPerformanceRow>[] = [
    {
      header: translate('columnTemplate'),
      key: 'templateKey',
      render: (row) => (
        <>
          <p className="font-medium">
            {TEMPLATE_NAMES.get(row.templateKey) ?? row.templateKey}
          </p>
          {TEMPLATE_NAMES.has(row.templateKey) && (
            <p className="text-xs text-muted-foreground">{row.templateKey}</p>
          )}
        </>
      ),
    },
    countColumn('queued', translate('columnQueued')),
    countColumn('accepted', translate('columnAccepted')),
    countColumn(
      'delivered',
      rateHeader(translate('columnDelivered')),
      'delivered',
    ),
    countColumn('bounced', translate('columnBounced')),
    countColumn('complained', translate('columnComplaints')),
    countColumn('opened', translate('columnOpens')),
    countColumn('clicked', rateHeader(translate('columnClicked')), 'clicked'),
    countColumn(
      'converted',
      rateHeader(translate('columnConverted')),
      'converted',
    ),
  ];

  return (
    <WorkspaceSurface tone="muted">
      <div className="space-y-4">
        {state === 'loading' ? (
          <div role="status" aria-label={translate('loading')}>
            <SkeletonCard showImage={false} />
          </div>
        ) : state === 'error' ? (
          <Alert variant="destructive" icon={false}>
            <AlertDescription>{translate('loadFailed')}</AlertDescription>
            <Button
              label={translate('retry')}
              variant={ButtonVariant.SECONDARY}
              onClick={() => void loadReport()}
            />
          </Alert>
        ) : !report || report.rows.length === 0 ? (
          <EmptyState title={translate('empty')} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {translate('queuedRange', {
                asOf: new Date(report.asOf).toLocaleString('en-US'),
                from: report.from.slice(0, 10),
                to: new Date(new Date(report.to).getTime() - 1)
                  .toISOString()
                  .slice(0, 10),
              })}
            </p>
            <Table<IEmailPerformanceRow>
              ariaLabel={translate('title')}
              columns={columns}
              getRowKey={(row) => row.templateKey}
              items={report.rows}
            />
          </div>
        )}
        <div className="space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
          <p>{translate('noteCounting')}</p>
          <p>{translate('noteApproximation')}</p>
          <p>{translate('noteAttribution')}</p>
        </div>
      </div>
    </WorkspaceSurface>
  );
}
