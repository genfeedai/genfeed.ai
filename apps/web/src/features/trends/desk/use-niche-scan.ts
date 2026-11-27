'use client';

import { TrendsService } from '@genfeedai/services/social/trends.service';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { getJsonApiErrorMessage } from '@services/core/json-api-error-message';
import { NotificationsService } from '@services/core/notifications.service';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';
import { isResearchScanLimitError } from '@/features/research/scans/research-scan-error';
import { useResearchScans } from '@/features/research/scans/use-research-scans';

/**
 * Scans the brand's niche for fresh trends: one keyword search, which spends
 * one trends scan. The API decides whether a scan is left; a refusal only
 * re-reads the counts so the limit alert shows when the next one opens.
 */
export function useNicheScan(refreshDesk: () => Promise<void>) {
  const translate = useTranslations('pages.researchScans.scan');
  const { refresh: refreshScans, statusFor } = useResearchScans();
  const [isScanning, setIsScanning] = useState(false);
  const getTrendsService = useAuthedService((token: string) =>
    TrendsService.getInstance(token),
  );

  const scan = useCallback(async () => {
    const notifications = NotificationsService.getInstance();
    setIsScanning(true);
    try {
      const service = await getTrendsService();
      await service.refreshTrends();
      notifications.success(translate('started'));
      await refreshDesk();
    } catch (error) {
      if (isResearchScanLimitError(error)) {
        notifications.info(translate('limitReached'));
      } else {
        notifications.error(getJsonApiErrorMessage(error, translate('failed')));
      }
    } finally {
      await refreshScans();
      setIsScanning(false);
    }
  }, [getTrendsService, refreshDesk, refreshScans, translate]);

  return { isScanning, scan, status: statusFor('trends') };
}
