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

function rate(numerator: number, denominator: number): string {
  return denominator > 0
    ? `${((numerator / denominator) * 100).toFixed(1)}%`
    : '—';
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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{translate('columnTemplate')}</TableHead>
                    <TableHead>{translate('columnQueued')}</TableHead>
                    <TableHead>{translate('columnAccepted')}</TableHead>
                    <TableHead>{translate('columnDelivered')}</TableHead>
                    <TableHead>{translate('columnBounced')}</TableHead>
                    <TableHead>{translate('columnComplaints')}</TableHead>
                    <TableHead>{translate('columnOpens')}</TableHead>
                    <TableHead>{translate('columnClicked')}</TableHead>
                    <TableHead>{translate('columnConverted')}</TableHead>
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
                      <TableCell>
                        {row.queued.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        {row.accepted.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        {row.delivered.toLocaleString('en-US')}
                        <p className="text-xs text-muted-foreground">
                          {translate('ofAccepted', {
                            rate: rate(row.delivered, row.accepted),
                          })}
                        </p>
                      </TableCell>
                      <TableCell>
                        {row.bounced.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        {row.complained.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        {row.opened.toLocaleString('en-US')}
                      </TableCell>
                      <TableCell>
                        {row.clicked.toLocaleString('en-US')}
                        <p className="text-xs text-muted-foreground">
                          {translate('ofAccepted', {
                            rate: rate(row.clicked, row.accepted),
                          })}
                        </p>
                      </TableCell>
                      <TableCell>
                        {row.converted.toLocaleString('en-US')}
                        <p className="text-xs text-muted-foreground">
                          {translate('ofAccepted', {
                            rate: rate(row.converted, row.accepted),
                          })}
                        </p>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
        <div className="space-y-2 border-t border-border pt-4 text-sm text-muted-foreground">
          <p>{translate('noteCounting')}</p>
          <p>{translate('noteApproximation')}</p>
          <p>{translate('noteAttribution')}</p>
        </div>
      </div>
    </WorkspaceSurface>
  );
}
