'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { LIFECYCLE_SYSTEM_EMAILS } from '@genfeedai/contracts/constants';
import type {
  IEmailPerformanceQuery,
  IEmailPerformanceReport,
  IEmailPerformanceRow,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableColumn } from '@props/ui/display/table.props';
import { AdminSystemEmailsService } from '@services/admin/system-emails.service';
import { logger } from '@services/core/logger.service';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import Table from '@ui/display/table/Table';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { EmptyState } from '@ui/primitives/empty-state';
import { useTranslations } from 'next-intl';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';

const TEMPLATE_NAMES = new Map(
  LIFECYCLE_SYSTEM_EMAILS.map((email) => [email.id as string, email.name]),
);

const NUMERIC_CELL = 'text-right tabular-nums';

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
  const [report, setReport] = useState<IEmailPerformanceReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const getService = useAuthedService((token: string) =>
    AdminSystemEmailsService.getInstance(token),
  );
  const controllerRef = useRef<AbortController | null>(null);

  const loadReport = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState('loading');
    try {
      const service = await getService();
      controller.signal.throwIfAborted();
      const data = await service.getPerformance(query, controller.signal);
      if (!controller.signal.aborted) {
        setReport(data);
        setState('ready');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      logger.error('Failed to load system email performance', error);
      setState('error');
    }
  }, [getService, query]);

  useEffect(() => {
    void loadReport();
    return () => controllerRef.current?.abort();
  }, [loadReport]);

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
