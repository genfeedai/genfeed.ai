'use client';

import {
  ButtonSize,
  ButtonVariant,
  SocialSourceHistoryImportStatus,
} from '@genfeedai/contracts';
import type { ISocialSource } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { AccountHistoryImportPanelProps } from '@props/pages/brand-integrations.props';
import { SocialSourcesService } from '@services/social/social-sources.service';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

type BadgeVariant = 'default' | 'info' | 'success' | 'warning' | 'destructive';

const STATUS_VARIANT: Record<SocialSourceHistoryImportStatus, BadgeVariant> = {
  [SocialSourceHistoryImportStatus.COMPLETED]: 'success',
  [SocialSourceHistoryImportStatus.FAILED]: 'destructive',
  [SocialSourceHistoryImportStatus.RUNNING]: 'info',
  [SocialSourceHistoryImportStatus.SCHEDULED]: 'info',
  [SocialSourceHistoryImportStatus.SKIPPED]: 'warning',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('en-US');
}

/**
 * One account's import of its existing posts: the latest run recorded on its
 * own-account source, and "Import now", which runs even when the import was
 * skipped at connect (there is no source yet in that case).
 */
export default function AccountHistoryImportPanel({
  brandId,
  connection,
}: AccountHistoryImportPanelProps) {
  const translate = useTranslations('pages.accountHistoryImport');
  const [source, setSource] = useState<ISocialSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isScheduling, setIsScheduling] = useState(false);
  const [status, setStatus] = useState<'queued' | 'error' | null>(null);
  const getSocialSourcesService = useAuthedService((token) =>
    SocialSourcesService.getInstance(token),
  );

  const loadSource = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const service = await getSocialSourcesService();
        const ownAccounts = await service.listOwnAccountSources(brandId);
        if (!signal?.aborted) {
          setSource(
            ownAccounts.find(
              (item) => item.credentialId === connection.credentialId,
            ) ?? null,
          );
        }
      } catch {
        if (!signal?.aborted) {
          setSource(null);
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [brandId, connection.credentialId, getSocialSourcesService],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSource(controller.signal);
    return () => controller.abort();
  }, [loadSource]);

  async function importNow() {
    if (isScheduling) return;
    setIsScheduling(true);
    setStatus(null);
    try {
      const service = await getSocialSourcesService();
      const result = await service.scheduleHistoryImport(
        connection.credentialId,
        brandId,
      );
      setStatus(result.status === 'scheduled' ? 'queued' : 'error');
      await loadSource();
    } catch {
      setStatus('error');
    } finally {
      setIsScheduling(false);
    }
  }

  const historyImport = source?.metadata?.historyImport;
  const importStatus = historyImport?.status;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {translate('description')}
      </p>

      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        {isLoading ? (
          <p className="text-xs text-muted-foreground">
            {translate('loading')}
          </p>
        ) : historyImport && importStatus ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_VARIANT[importStatus]}>
                {translate(`status.${importStatus}`)}
              </Badge>
              <Badge variant="ghost">{translate('notGenerated')}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {importStatus === SocialSourceHistoryImportStatus.COMPLETED &&
                translate('completedSummary', {
                  count: historyImport.importedCount ?? 0,
                  date: formatDate(historyImport.completedAt),
                  windowDays: historyImport.windowDays ?? 0,
                })}
              {importStatus === SocialSourceHistoryImportStatus.FAILED &&
                translate('failedSummary', {
                  error: historyImport.error ?? '',
                })}
              {(importStatus === SocialSourceHistoryImportStatus.SCHEDULED ||
                importStatus === SocialSourceHistoryImportStatus.RUNNING) &&
                translate('pendingSummary', {
                  date: formatDate(historyImport.requestedAt),
                  windowDays: historyImport.windowDays ?? 0,
                })}
              {importStatus === SocialSourceHistoryImportStatus.SKIPPED &&
                translate('skippedSummary')}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {translate('notImported')}
          </p>
        )}
        <div>
          <Button
            label={translate('importNow')}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            isLoading={isScheduling}
            isDisabled={
              isLoading ||
              isScheduling ||
              importStatus === SocialSourceHistoryImportStatus.RUNNING
            }
            onClick={() => void importNow()}
          />
        </div>
      </div>

      {status ? (
        <p
          role={status === 'error' ? 'alert' : 'status'}
          className="text-sm text-muted-foreground"
        >
          {translate(status)}
        </p>
      ) : null}
    </div>
  );
}
