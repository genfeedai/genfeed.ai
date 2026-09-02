import { CacheService } from '@api/services/cache/cache.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import type { ReplicatePredictionRecord } from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import type { ReplicateWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * How long a delivered `webhook-id` suppresses repeats. Replicate retries a
 * failed delivery for roughly a day, so the window has to outlive the retry
 * schedule for dedupe to mean anything.
 */
const REPLAY_WINDOW_SECONDS = 24 * 60 * 60;

const REPLAY_CACHE_NAMESPACE = 'webhook:replicate:delivery';

function isPredictionRecord(
  value: unknown,
): value is ReplicatePredictionRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'string'
  );
}

/**
 * Removes the Replicate webhook signing secret from the trust path.
 *
 * The secret is account-scoped with no rotation mechanism, so it must be
 * treated as permanently compromisable. This service re-derives the two things
 * a forged body could otherwise dictate — the prediction's status and its
 * output — from Replicate's own API using the account token, and suppresses
 * replays of a captured legitimate delivery.
 */
@Injectable()
export class ReplicateWebhookVerificationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly replicateService: ReplicateService,
  ) {}

  /**
   * Whether this delivery has already been handled.
   *
   * Fails open in both degraded cases — an absent `webhook-id` header and an
   * unreachable cache — because signature validation has already run by this
   * point, and dropping legitimate callbacks would strand generations in a
   * pending state forever.
   */
  async isReplay(webhookId: unknown): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (typeof webhookId !== 'string' || webhookId.length === 0) {
      this.loggerService.warn(`${url} no webhook-id header, cannot dedupe`);
      return false;
    }

    const outcome = await this.cacheService.claimOnce(
      this.cacheService.generateKey(REPLAY_CACHE_NAMESPACE, webhookId),
      REPLAY_WINDOW_SECONDS,
      [REPLAY_CACHE_NAMESPACE],
    );

    if (outcome === 'duplicate') {
      this.loggerService.warn(`${url} replayed delivery suppressed`, {
        webhookId,
      });
      return true;
    }

    if (outcome === 'unavailable') {
      this.loggerService.warn(`${url} cache unavailable, dedupe skipped`, {
        webhookId,
      });
    }

    return false;
  }

  /**
   * Park an untrusted delivery for later reconciliation. Never dispatches
   * signed status/output; ops/reconcile can re-fetch by prediction id.
   */
  async deferUntrustedDelivery(
    payload: ReplicateWebhookPayload,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const predictionId = payload.id;

    await this.cacheService.claimOnce(
      this.cacheService.generateKey(
        'webhook:replicate:untrusted',
        predictionId,
      ),
      REPLAY_WINDOW_SECONDS,
      ['webhook:replicate:untrusted'],
    );

    this.loggerService.warn(
      `${url} untrusted Replicate delivery deferred for reconciliation`,
      { predictionId },
    );
  }

  /**
   * Returns a payload whose state-changing fields come from Replicate's own
   * record. A null result is untrusted and must never be dispatched.
   */
  async resolveTrustedPayload(
    payload: ReplicateWebhookPayload,
  ): Promise<ReplicateWebhookPayload | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.configService.get('REPLICATE_KEY')) {
      this.loggerService.warn(
        `${url} REPLICATE_KEY not configured, deferring untrusted payload`,
        { predictionId: payload.id },
      );
      return null;
    }

    let prediction: unknown;
    try {
      prediction = await this.replicateService.getPrediction(payload.id);
    } catch (error: unknown) {
      this.loggerService.warn(
        `${url} prediction re-fetch failed, deferring untrusted payload`,
        { error, predictionId: payload.id },
      );
      return null;
    }

    if (!isPredictionRecord(prediction) || prediction.id !== payload.id) {
      this.loggerService.warn(
        `${url} prediction re-fetch returned a mismatched record`,
        { predictionId: payload.id },
      );
      return null;
    }

    if (typeof prediction.status !== 'string') {
      this.loggerService.warn(
        `${url} prediction re-fetch returned an invalid status`,
        { predictionId: payload.id },
      );
      return null;
    }

    return {
      ...payload,
      error: prediction.error,
      output: prediction.output,
      status: prediction.status,
      version:
        typeof prediction.version === 'string' ? prediction.version : undefined,
    };
  }
}
