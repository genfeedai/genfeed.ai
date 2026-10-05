import type { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { ModelPricingRateChange } from '@genfeedai/contracts/interfaces';

/** A provider changed a price; the approved rate keeps charging. */
export interface ModelPriceChangeAlert {
  changes: ModelPricingRateChange[];
  modelKey: string;
  pendingRateHash: string;
  provider: string;
  sourceUrl: string | null;
}

/** A reviewed model's price refresh failed, so its last approved rate is unconfirmed. */
export interface ModelPricingUnavailableAlert {
  modelKey: string;
  provider: string;
  reason: string;
}

/**
 * Ops Discord: one alert per model and pending rate set, so the same
 * unapproved price change never repeats on the next daily run.
 */
export async function dispatchModelPriceChangeAlert(
  recorder: ActivityRecorderService,
  alert: ModelPriceChangeAlert,
): Promise<void> {
  await recorder.dispatch({
    deduplicationKey: `message.model-price-change/${alert.modelKey}/${alert.pendingRateHash}`,
    messages: [
      {
        destination: null,
        message: {
          action: 'model_price_change',
          payload: {
            changes: alert.changes,
            modelKey: alert.modelKey,
            provider: alert.provider,
            sourceUrl: alert.sourceUrl,
          },
          type: 'discord',
        },
      },
    ],
    organizationId: null,
    source: { id: alert.modelKey, type: 'model' },
    topic: 'operator.alerts',
  });
}

/** Ops Discord: at most one alert per model and reason per UTC day. */
export async function dispatchModelPricingUnavailableAlert(
  recorder: ActivityRecorderService,
  alert: ModelPricingUnavailableAlert,
  now: Date,
): Promise<void> {
  const day = now.toISOString().slice(0, 10);
  await recorder.dispatch({
    deduplicationKey: `message.model-pricing-unavailable/${alert.modelKey}/${alert.reason}/${day}`,
    messages: [
      {
        destination: null,
        message: {
          action: 'model_pricing_unavailable',
          payload: {
            modelKey: alert.modelKey,
            provider: alert.provider,
            reason: alert.reason,
          },
          type: 'discord',
        },
      },
    ],
    organizationId: null,
    occurredAt: now,
    source: { id: alert.modelKey, type: 'model' },
    topic: 'operator.alerts',
  });
}
