'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { LIFECYCLE_SYSTEM_EMAILS } from '@genfeedai/contracts/constants';
import type { IEmailPerformanceReport } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminSystemEmailsService } from '@services/admin/system-emails.service';
import { logger } from '@services/core/logger.service';
import { CardEmptyContent } from '@ui/card/empty/CardEmpty';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { WorkspaceSurface } from '@ui/overview/WorkspaceSurface';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Input } from '@ui/primitives/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

const DAY_MS = 86_400_000;
const TEMPLATE_NAMES = new Map(
  LIFECYCLE_SYSTEM_EMAILS.map((email) => [email.id as string, email.name]),
);

function dateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function rate(numerator: number, denominator: number): string {
  return denominator > 0
    ? `${((numerator / denominator) * 100).toFixed(1)}%`
    : '—';
}

export default function SystemEmailPerformance() {
  const translate = useTranslations('pages.systemEmailPerformance');
  const [from, setFrom] = useState(() =>
    dateInputValue(new Date(Date.now() - 29 * DAY_MS)),
  );
  const [to, setTo] = useState(() => dateInputValue(new Date()));
  const [query, setQuery] = useState(() => ({
    from: `${from}T00:00:00.000Z`,
    to: new Date(
      new Date(`${to}T00:00:00.000Z`).getTime() + DAY_MS,
    ).toISOString(),
  }));
  const [report, setReport] = useState<IEmailPerformanceReport | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const getService = useAuthedService((token: string) =>
    AdminSystemEmailsService.getInstance(token),
  );
  const duration = new Date(to).getTime() - new Date(from).getTime() + DAY_MS;
  const validRange =
    Number.isFinite(duration) && duration > 0 && duration <= 90 * DAY_MS;

  useEffect(() => {
    const controller = new AbortController();
    async function loadReport() {
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
    }
    void loadReport();
    return () => controller.abort();
  }, [getService, query]);

  function applyRange() {
    if (!validRange) return;
    setQuery({
      from: `${from}T00:00:00.000Z`,
      to: new Date(
        new Date(`${to}T00:00:00.000Z`).getTime() + DAY_MS,
      ).toISOString(),
    });
  }

  return (
    <WorkspaceSurface title={translate('title')} tone="muted">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">{translate('intro')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label={translate('from')}
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
          <Input
            label={translate('through')}
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
          />
          <Button
            label={translate('applyDates')}
            variant={ButtonVariant.SECONDARY}
            isDisabled={!validRange}
            onClick={applyRange}
          />
        </div>
        {!validRange && (
          <p role="alert" className="text-sm text-destructive">
            {translate('invalidRange')}
          </p>
        )}
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
              onClick={() => setQuery((value) => ({ ...value }))}
            />
          </Alert>
        ) : !report || report.rows.length === 0 ? (
          <CardEmptyContent label={translate('empty')} />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {translate('queuedRange', {
                asOf: new Date(report.asOf).toLocaleString(),
                from: report.from.slice(0, 10),
                to: dateInputValue(new Date(new Date(report.to).getTime() - 1)),
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
                      <TableCell>{row.queued.toLocaleString()}</TableCell>
                      <TableCell>{row.accepted.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.delivered.toLocaleString()}
                        <p className="text-xs text-muted-foreground">
                          {translate('ofAccepted', {
                            rate: rate(row.delivered, row.accepted),
                          })}
                        </p>
                      </TableCell>
                      <TableCell>{row.bounced.toLocaleString()}</TableCell>
                      <TableCell>{row.complained.toLocaleString()}</TableCell>
                      <TableCell>{row.opened.toLocaleString()}</TableCell>
                      <TableCell>
                        {row.clicked.toLocaleString()}
                        <p className="text-xs text-muted-foreground">
                          {translate('ofAccepted', {
                            rate: rate(row.clicked, row.accepted),
                          })}
                        </p>
                      </TableCell>
                      <TableCell>
                        {row.converted.toLocaleString()}
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
