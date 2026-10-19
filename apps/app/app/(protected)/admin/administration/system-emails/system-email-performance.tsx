'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { LIFECYCLE_SYSTEM_EMAILS } from '@genfeedai/contracts/constants';
import type {
  IEmailPerformanceQuery,
  IEmailPerformanceReport,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminSystemEmailsService } from '@services/admin/system-emails.service';
import { logger } from '@services/core/logger.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';

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

  return (
    <WorkspaceSurface title={translate('title')} tone="muted">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{translate('intro')}</p>
        {state === 'loading' ? (
          <div role="status" aria-label={translate('loading')}>
            <SkeletonCard showImage={false} />
          </div>
        ) : state === 'error' ? (
          <Alert variant="destructive">
            <AlertDescription>{translate('loadFailed')}</AlertDescription>
            <Button
              label={translate('retry')}
              variant={ButtonVariant.SECONDARY}
              onClick={() => void loadReport()}
            />
          </Alert>
        ) : !report || report.rows.length === 0 ? (
          <CardEmptyContent label={translate('empty')} />
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
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translate('columnTemplate')}</TableHead>
                    <TableHead className={NUMERIC_CELL}>
                      {translate('columnQueued')}
                    </TableHead>
                    <TableHead className={NUMERIC_CELL}>
                      {translate('columnAccepted')}
                    </TableHead>
                    <TableHead className={NUMERIC_CELL}>
                      {translate('columnDelivered')}
                      <RateCaption label={translate('rateCaption')} />
                    </TableHead>
                    <TableHead className={NUMERIC_CELL}>
                      {translate('columnBounced')}
                    </TableHead>
                    <TableHead className={NUMERIC_CELL}>
                      {translate('columnComplaints')}
                    </TableHead>
                    <TableHead className={NUMERIC_CELL}>
                      {translate('columnOpens')}
                    </TableHead>
                    <TableHead className={NUMERIC_CELL}>
                      {translate('columnClicked')}
                      <RateCaption label={translate('rateCaption')} />
                    </TableHead>
                    <TableHead className={NUMERIC_CELL}>
                      {translate('columnConverted')}
                      <RateCaption label={translate('rateCaption')} />
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.rows.map((row) => (
                    <TableRow key={row.templateKey}>
                      <TableCell>
                        <p className="font-medium">
                          {TEMPLATE_NAMES.get(row.templateKey) ??
                            row.templateKey}
                        </p>
                        {TEMPLATE_NAMES.has(row.templateKey) && (
                          <p className="text-xs text-muted-foreground">
                            {row.templateKey}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className={NUMERIC_CELL}>
                        {formatCount(row.queued)}
                      </TableCell>
                      <TableCell className={NUMERIC_CELL}>
                        {formatCount(row.accepted)}
                      </TableCell>
                      <TableCell className={NUMERIC_CELL}>
                        {formatCount(row.delivered)}
                        <Rate
                          numerator={row.delivered}
                          denominator={row.accepted}
                        />
                      </TableCell>
                      <TableCell className={NUMERIC_CELL}>
                        {formatCount(row.bounced)}
                      </TableCell>
                      <TableCell className={NUMERIC_CELL}>
                        {formatCount(row.complained)}
                      </TableCell>
                      <TableCell className={NUMERIC_CELL}>
                        {formatCount(row.opened)}
                      </TableCell>
                      <TableCell className={NUMERIC_CELL}>
                        {formatCount(row.clicked)}
                        <Rate
                          numerator={row.clicked}
                          denominator={row.accepted}
                        />
                      </TableCell>
                      <TableCell className={NUMERIC_CELL}>
                        {formatCount(row.converted)}
                        <Rate
                          numerator={row.converted}
                          denominator={row.accepted}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
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
