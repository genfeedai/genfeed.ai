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

    const parsed: unknown = JSON.parse(stored);
    return this.isCallbackContext(parsed) ? parsed : undefined;
  }

  async remove(ingredientId: string): Promise<void> {
    await this.redisClient().unlink(this.callbackKey(ingredientId));
  }

  private callbackKey(ingredientId: string): string {
    return `${CALLBACK_CONTEXT_KEY_PREFIX}:${ingredientId}`;
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
