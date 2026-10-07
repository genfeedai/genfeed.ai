import { createHmac, timingSafeEqual } from 'node:crypto';
import { CacheService } from '@api/services/cache/cache.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, UnauthorizedException } from '@nestjs/common';

/** HeyGen retries signed payloads for up to 24 hours. */
const REPLAY_WINDOW_SECONDS = 24 * 60 * 60;

const REPLAY_CACHE_NAMESPACE = 'webhook:heygen:delivery';

/**
 * Proves an inbound HeyGen callback actually came from HeyGen.
 *
 * The endpoint previously authenticated with a secret we issued ourselves and
 * appended to our own callback URL as `?token=`, which put a live credential in
 * every request line, proxy log, and HeyGen dashboard field. HeyGen signs
 * deliveries to a registered endpoint with an HMAC over the raw body, so the
 * same environment variable now holds *their* signing secret and the URL we
 * register carries nothing sensitive.
 */
@Injectable()
export class HeygenWebhookVerificationService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Throws unless `signature` is HeyGen's HMAC over exactly these bytes.
   *
   * Fails closed on an unconfigured secret: an endpoint that cannot tell a
   * forged callback from a real one must not accept either. `rawBody` has to be
   * the untouched request bytes — re-serializing a parsed body changes key
   * order and drops unknown fields, and the digest never matches again.
   */
  assertSignature(rawBody: Buffer, signature: unknown): void {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    const secret = this.configService.get('HEYGEN_WEBHOOK_SECRET') as
      | string
      | undefined;

    if (!secret?.trim()) {
      this.loggerService.error(
        `${url} rejected — HEYGEN_WEBHOOK_SECRET is not configured. Register an endpoint at https://api.heygen.com/v3/webhooks/endpoints and store the secret it returns.`,
      );
      throw new UnauthorizedException('Webhook secret not configured');
    }

    if (typeof signature !== 'string' || !/^[a-fA-F0-9]{64}$/.test(signature)) {
      throw new UnauthorizedException('Missing signature header');
    }

    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid signature');
    }
  }

  /**
   * Whether this delivery has already been handled.
   *
   * Fails open in both degraded cases — an absent event identity and an unreachable
   * cache — because the signature has already proven authenticity by this
   * point, and dropping legitimate callbacks would strand avatar videos in a
   * pending state forever.
   */
  async isReplay(eventId: unknown): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (typeof eventId !== 'string' || eventId.length === 0) {
      this.loggerService.warn(`${url} no event identity, cannot dedupe`);
      return false;
    }

    const outcome = await this.cacheService.claimOnce(
      this.cacheService.generateKey(REPLAY_CACHE_NAMESPACE, eventId),
      REPLAY_WINDOW_SECONDS,
      [REPLAY_CACHE_NAMESPACE],
    );

    if (outcome === 'duplicate') {
      this.loggerService.warn(`${url} replayed delivery suppressed`, {
        eventId,
      });
      return true;
    }

    if (outcome === 'unavailable') {
      this.loggerService.warn(`${url} cache unavailable, dedupe skipped`, {
        eventId,
      });
    }

    return false;
  }

  /**
   * Give back a claim taken by {@link isReplay} for a delivery that failed
   * processing. HeyGen retries with the same event identity, so a claim left in
   * place after a failure would suppress the retry for the whole replay
   * window and the callback would be lost.
   */
  async releaseReplayClaim(eventId: unknown): Promise<void> {
    if (typeof eventId !== 'string' || eventId.length === 0) {
      return;
    }

    await this.cacheService.del(
      this.cacheService.generateKey(REPLAY_CACHE_NAMESPACE, eventId),
    );
  }
}
