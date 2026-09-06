'use client';

import {
  ButtonSize,
  ButtonVariant,
  SocialSourceHistoryImportStatus,
} from '@genfeedai/contracts';
import type {
  ISocialSource,
  SocialSourceHistoryImport,
} from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { BrandSocialHistoryImportCardProps } from '@props/pages/brand-detail.props';
import { BrandsService } from '@services/social/brands.service';
import { SocialSourcesService } from '@services/social/social-sources.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Switch } from '@ui/primitives/switch';
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

function readHistoryImport(
  source: ISocialSource,
): SocialSourceHistoryImport | undefined {
  return source.metadata?.historyImport;
}

function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

/**
 * Connect-time history import controls: the brand-level opt-in switch plus an
 * audit of every own-account source that was imported (or skipped), so the
 * brand always knows which posts Genfeed pulled in and when. Imported posts
 * are the account's own history, not Genfeed output — they show under
 * "My accounts" in Discovery.
 */
export default function BrandSocialHistoryImportCard({
  brand,
  brandId,
  onRefreshBrand,
}: BrandSocialHistoryImportCardProps) {
  const translate = useTranslations('pages.brandSocialHistoryImport');
  const isEnabled = brand.isSocialHistoryImportEnabled !== false;
  const [isSaving, setIsSaving] = useState(false);
  const [sources, setSources] = useState<ISocialSource[]>([]);
  const [isLoadingSources, setIsLoadingSources] = useState(false);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [status, setStatus] = useState<'saved' | 'error' | 'queued' | null>(
    null,
  );
  const getBrandsService = useAuthedService((token) =>
    BrandsService.getInstance(token),
  );
  const getSocialSourcesService = useAuthedService((token) =>
    SocialSourcesService.getInstance(token),
  );

  const loadSources = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoadingSources(true);
      try {
        const service = await getSocialSourcesService();
        const ownAccounts = await service.listOwnAccountSources(brandId);
        if (!signal?.aborted) {
          setSources(ownAccounts);
        }
      } catch {
        if (!signal?.aborted) {
          setSources([]);
        }
      } finally {
        if (!signal?.aborted) {
          setIsLoadingSources(false);
        }
      }
    },
    [brandId, getSocialSourcesService],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadSources(controller.signal);
    return () => controller.abort();
  }, [loadSources]);

  async function toggle(nextValue: boolean) {
    if (isSaving) return;
    setIsSaving(true);
    setStatus(null);
    try {
      const service = await getBrandsService();
      await service.updateSocialHistoryImport(brandId, nextValue);
      await onRefreshBrand();
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setIsSaving(false);
    }
  }

  async function reschedule(sourceId: string) {
    if (reschedulingId) return;
    setReschedulingId(sourceId);
    setStatus(null);
    try {
      const service = await getSocialSourcesService();
      const result = await service.scheduleHistoryImport(sourceId, brandId);
      setStatus(result.status === 'scheduled' ? 'queued' : 'error');
      await loadSources();
    } catch {
      setStatus('error');
    } finally {
      setReschedulingId(null);
    }
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div>
          <h3 className="text-sm font-semibold">{translate('title')}</h3>
          <p className="text-xs text-muted-foreground">
            {translate('description')}
          </p>
        </div>
        <Switch
          aria-label={translate('toggleLabel')}
          label={translate('toggleLabel')}
          description={translate('toggleDescription')}
          isChecked={isEnabled}
          isDisabled={isSaving}
          onCheckedChange={(checked) => void toggle(checked)}
        />
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {translate('auditTitle')}
          </h4>
          {isLoadingSources && sources.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate('loading')}
            </p>
          ) : sources.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {translate('empty')}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {sources.map((source) => {
                const historyImport = readHistoryImport(source);
                const importStatus =
                  historyImport?.status ??
                  SocialSourceHistoryImportStatus.SKIPPED;
                const completedAt = formatDate(historyImport?.completedAt);
                const requestedAt = formatDate(historyImport?.requestedAt);
                return (
                  <li
                    key={source.id}
                    className="flex flex-col gap-1 rounded-md border border-border p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium capitalize">
                        {source.platform}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        @{source.handle}
                      </span>
                      <Badge variant={STATUS_VARIANT[importStatus]}>
                        {translate(`status.${importStatus}`)}
                      </Badge>
                      <Badge variant="ghost">{translate('notGenerated')}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {importStatus ===
                        SocialSourceHistoryImportStatus.COMPLETED &&
                        translate('completedSummary', {
                          count: historyImport?.importedCount ?? 0,
                          date: completedAt ?? '',
                          windowDays: historyImport?.windowDays ?? 0,
                        })}
                      {importStatus ===
                        SocialSourceHistoryImportStatus.FAILED &&
                        translate('failedSummary', {
                          error: historyImport?.error ?? '',
                        })}
                      {(importStatus ===
                        SocialSourceHistoryImportStatus.SCHEDULED ||
                        importStatus ===
                          SocialSourceHistoryImportStatus.RUNNING) &&
                        translate('pendingSummary', {
                          date: requestedAt ?? '',
                          windowDays: historyImport?.windowDays ?? 0,
                        })}
                      {importStatus ===
                        SocialSourceHistoryImportStatus.SKIPPED &&
                        translate('skippedSummary')}
                    </p>
                    <div>
                      <Button
                        label={translate('importNow')}
                        size={ButtonSize.SM}
                        variant={ButtonVariant.SECONDARY}
                        isLoading={reschedulingId === source.id}
                        isDisabled={
                          !isEnabled ||
                          reschedulingId !== null ||
                          importStatus ===
                            SocialSourceHistoryImportStatus.RUNNING
                        }
                        onClick={() => void reschedule(source.id)}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {status && (
          <p
            role={status === 'error' ? 'alert' : 'status'}
            className="text-sm text-muted-foreground"
          >
            {translate(status)}
          </p>
        )}
      </div>
    </Card>
  );
}
