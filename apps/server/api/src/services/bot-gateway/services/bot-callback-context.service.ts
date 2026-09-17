import { CredentialPlatform } from '@genfeedai/contracts';
import type { IBotCallbackContext } from '@genfeedai/contracts/interfaces';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

const CALLBACK_CONTEXT_TTL_SECONDS = 24 * 60 * 60;
const CALLBACK_CONTEXT_KEY_PREFIX = 'bot-generation:callback';
const BOT_PLATFORMS = new Set<string>([
  CredentialPlatform.DISCORD,
  CredentialPlatform.SLACK,
  CredentialPlatform.TELEGRAM,
]);

/**
 * Atomically read remaining TTL and consume the key (Redis `GETDEL`) so two
 * callers cannot both observe the same single-use callback record.
 */
const CLAIM_CALLBACK_CONTEXT_SCRIPT = `
local ttl = redis.call('PTTL', KEYS[1])
local value = redis.call('GETDEL', KEYS[1])
if not value then
  return nil
end
return {value, ttl}
`;

export type ClaimedBotCallbackContext = {
  claimedAtMs: number;
  context: IBotCallbackContext;
  remainingTtlMs: number;
};

/**
 * Durable store for the interaction a bot-triggered generation must answer
 * once the media finishes. Redis-only so the webhook media path can reach it
 * without pulling in the generation dispatcher behind the bot gateway.
 */
@Injectable()
export class BotCallbackContextService {
  constructor(private readonly redisService: RedisService) {}

  async store(
    ingredientId: string,
    callbackContext: IBotCallbackContext,
  ): Promise<void> {
    await this.redisClient().setex(
      this.callbackKey(ingredientId),
      CALLBACK_CONTEXT_TTL_SECONDS,
      JSON.stringify({ ...callbackContext, ingredientId }),
    );
  }

  async get(ingredientId: string): Promise<IBotCallbackContext | undefined> {
    const stored = await this.redisClient().get(this.callbackKey(ingredientId));
    if (!stored) {
      return undefined;
    }

    return this.parseCallbackContext(stored);
  }

  /**
   * Claim the stored record for `ingredientId` exactly once. A second caller
   * racing the same generation observes nothing. Remaining lifetime is
   * captured with the consume so a failed delivery can restore without
   * extending the original expiry.
   */
  async claim(
    ingredientId: string,
  ): Promise<ClaimedBotCallbackContext | undefined> {
    const claimed = await this.redisClient().eval(
      CLAIM_CALLBACK_CONTEXT_SCRIPT,
      1,
      this.callbackKey(ingredientId),
    );
    const parsedClaim = this.parseClaimResult(claimed);
    if (!parsedClaim) {
      return undefined;
    }

    const context = this.parseCallbackContext(parsedClaim.raw);
    if (!context) {
      return undefined;
    }

    return {
      claimedAtMs: Date.now(),
      context,
      remainingTtlMs: parsedClaim.remainingTtlMs,
    };
  }

  /**
   * Put a previously claimed record back only when no newer record exists for
   * the same generation. Remaining lifetime is the original expiry minus
   * elapsed time since the claim, never a fresh window. `NX` loses a race
   * with a newer record rather than clobbering it.
   */
  async restore(
    ingredientId: string,
    claimed: ClaimedBotCallbackContext,
  ): Promise<boolean> {
    const remainingTtlMs =
      claimed.remainingTtlMs === -1
        ? -1
        : claimed.remainingTtlMs - (Date.now() - claimed.claimedAtMs);

    if (remainingTtlMs !== -1 && remainingTtlMs < 1) {
      return false;
    }

    const key = this.callbackKey(ingredientId);
    const serialized = JSON.stringify({
      ...claimed.context,
      ingredientId,
    });
    const client = this.redisClient();

    if (remainingTtlMs === -1) {
      const result = await client.set(key, serialized, 'NX');
      return result === 'OK';
    }

    const result = await client.set(
      key,
      serialized,
      'PX',
      Math.floor(remainingTtlMs),
      'NX',
    );
    return result === 'OK';
  }

  private callbackKey(ingredientId: string): string {
    return `${CALLBACK_CONTEXT_KEY_PREFIX}:${ingredientId}`;
  }

  private parseClaimResult(
    result: unknown,
  ): { raw: string; remainingTtlMs: number } | undefined {
    if (!Array.isArray(result) || result.length < 2) {
      return undefined;
    }

    const [raw, ttl] = result;
    if (typeof raw !== 'string') {
      return undefined;
    }

    const remainingTtlMs = typeof ttl === 'number' ? ttl : Number(ttl);
    if (!Number.isFinite(remainingTtlMs)) {
      return undefined;
    }

    return { raw, remainingTtlMs };
  }

  private parseCallbackContext(
    stored: string,
  ): IBotCallbackContext | undefined {
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      return undefined;
    }

    return this.isCallbackContext(parsed) ? parsed : undefined;
  }

  private isCallbackContext(value: unknown): value is IBotCallbackContext {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const context = value as Record<string, unknown>;
    return (
      typeof context.applicationId === 'string' &&
      typeof context.chatId === 'string' &&
      typeof context.interactionToken === 'string' &&
      typeof context.platform === 'string' &&
      BOT_PLATFORMS.has(context.platform)
    );
  }

  private redisClient() {
    const client = this.redisService.getPublisher();
    if (!client) {
      throw new ServiceUnavailableException(
        'Bot generation callbacks require Redis to be configured',
      );
    }
    return client;
  }
}
