import { CacheService } from '@api/services/cache/services/cache.service';
import { ConfigService } from '@libs/config/config.service';
import type {
  ReplicatePredictionRecord,
  ReplicateWebhookPayload,
} from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ReplicateService } from '@server/services/integrations/replicate/services/replicate.service';

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
   * Returns the payload with its status and output replaced by Replicate's own
   * record of the prediction.
   *
   * Falls back to the signed body when the prediction cannot be fetched — no
   * API token configured (self-hosted), or a prediction created with a
   * per-organization BYOK token the platform key cannot read. The output-host
   * allowlist applied downstream is the floor that still holds in that case;
   * this is the ceiling on top of it.
   */
  async resolveTrustedPayload(
    payload: ReplicateWebhookPayload,
  ): Promise<ReplicateWebhookPayload> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.configService.get('REPLICATE_KEY')) {
      this.loggerService.warn(
        `${url} REPLICATE_KEY not configured, trusting signed payload`,
        { predictionId: payload.id },
      );
      return payload;
    }

    let prediction: unknown;
    try {
      prediction = await this.replicateService.getPrediction(payload.id);
    } catch (error: unknown) {
      this.loggerService.warn(
        `${url} prediction re-fetch failed, trusting signed payload`,
        { error, predictionId: payload.id },
      );
      return payload;
    }

    if (!isPredictionRecord(prediction) || prediction.id !== payload.id) {
      this.loggerService.warn(
        `${url} prediction re-fetch returned a mismatched record`,
        { predictionId: payload.id },
      );
      return payload;
    }

    return {
      ...payload,
      error: prediction.error,
      output: prediction.output,
      status:
        typeof prediction.status === 'string'
          ? prediction.status
          : payload.status,
      version: prediction.version ?? payload.version,
    };
  }
}
