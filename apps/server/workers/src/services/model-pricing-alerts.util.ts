import { createHash } from 'node:crypto';
import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type {
  ModelPricingRateChange,
  ModelScanReport,
} from '@genfeedai/contracts/interfaces';

/** A provider changed a price; the approved rate keeps charging. */
export interface ModelPriceChangeAlert {
  changes: ModelPricingRateChange[];
  /** The new provider cost is above our current sell price. */
  isUrgent: boolean;
  modelKey: string;
  pendingRateHash: string;
  provider: string;
  sourceUrl: string | null;
  urgentReason: string | null;
}

/** A reviewed model's price refresh failed, so its last approved rate is unconfirmed. */
export interface ModelPricingUnavailableAlert {
  /** Sync failure code, for example `rates_unavailable:unmapped_metric:gpu_seconds`. */
  code: string;
  modelKey: string;
  provider: string;
  reason: string;
}

/** True when the run found nothing an operator has to act on. */
export function isModelScanReportEmpty(report: ModelScanReport): boolean {
  return (
    report.priceChanges.length === 0 &&
    report.delisted.length === 0 &&
    report.removedByProvider.length === 0 &&
    report.newDrafts.length === 0 &&
    report.unreadable.length === 0 &&
    report.dataErrors.length === 0
  );
}

/**
 * Identifies what a report asks an operator to do, ignoring when it ran and
 * its counters. Two runs that flag the same things hash the same.
 */
export function modelScanReportHash(report: ModelScanReport): string {
  const parts = [
    ...report.priceChanges.map(
      (entry) =>
        `price:${entry.modelKey}:${entry.pendingRateHash}:${entry.isUrgent}`,
    ),
    ...report.delisted.map((entry) => `delisted:${entry.modelKey}`),
    ...report.removedByProvider.map((entry) => `removed:${entry.modelKey}`),
    ...report.newDrafts.map((entry) => `new:${entry.modelKey}`),
    ...report.unreadable.map(
      (entry) => `unreadable:${entry.modelKey}:${entry.code}`,
    ),
    ...report.dataErrors.map((entry) => `data:${entry.modelKey}`),
  ].sort();
  return createHash('sha256')
    .update(parts.join('\n'))
    .digest('hex')
    .slice(0, 16);
}

/**
 * Ops Discord: one card per provider run. Sends nothing when the run found
 * nothing, and the same findings never post twice: the dedupe key is the
 * provider plus a hash of what the report flags. Resolves true when a card
 * was handed to the outbox.
 */
export async function dispatchModelScanCard(
  recorder: ActivityRecorderService,
  report: ModelScanReport,
): Promise<boolean> {
  if (isModelScanReportEmpty(report)) return false;
  await recorder.dispatch({
    deduplicationKey: `message.model-scan/${report.provider}/${modelScanReportHash(report)}`,
    messages: [
      {
        destination: null,
        message: { action: 'model_scan', payload: report, type: 'discord' },
      },
    ],
    occurredAt: new Date(report.startedAt),
    organizationId: null,
    source: { id: report.provider, type: 'model_scan' },
    topic: 'operator.alerts',
  });
  return true;
}
