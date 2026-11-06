import type {
  BotCallbackContextService,
  ClaimedBotCallbackContext,
} from '@api/services/bot-gateway/services/bot-callback-context.service';
import { BotCallbackResponderService } from '@api/services/bot-gateway/services/bot-callback-responder.service';
import type { BotPlatformAdapterRegistryService } from '@api/services/bot-gateway/services/bot-platform-adapter-registry.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { IBotPlatformAdapter } from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

interface Delivery {
  applicationId: string;
  body: string;
  interactionToken: string;
  mediaType?: string;
  mediaUrl?: string;
  viewUrl?: string;
}

const claimFor = (
  platform: CredentialPlatform,
  remainingTtlMs = 60_000,
): ClaimedBotCallbackContext => ({
  claimedAtMs: 0,
  context: {
    applicationId: 'app-1',
    chatId: 'chat-1',
    interactionToken: 'token-1',
    platform,
  },
  remainingTtlMs,
});

describe('BotCallbackResponderService', () => {
  let callbacks: Map<string, ClaimedBotCallbackContext>;
  let delivered: Delivery[];
  let isPlatformDown: boolean;
  let isRestoreRefused: boolean;
  let appUrl: string | undefined;
  let warnings: string[];
  let service: BotCallbackResponderService;

  beforeEach(() => {
    callbacks = new Map();
    delivered = [];
    isPlatformDown = false;
    isRestoreRefused = false;
    appUrl = 'https://app.genfeed.ai';
    warnings = [];

    // The Redis callback store: a claim consumes the context exactly once.
    const store = {
      claim: async (ingredientId: string) => {
        const claimed = callbacks.get(ingredientId);
        callbacks.delete(ingredientId);
        return claimed;
      },
      restore: async (
        ingredientId: string,
        claimed: ClaimedBotCallbackContext,
      ) => {
        if (isRestoreRefused) return false;
        callbacks.set(ingredientId, claimed);
        return true;
      },
    } as unknown as BotCallbackContextService;
    const discord = {
      sendFollowupMedia: async (
        applicationId: string,
        interactionToken: string,
        mediaUrl: string,
        mediaType: string,
        body: string,
        viewUrl?: string,
      ) => {
        if (isPlatformDown) throw new Error('Discord unavailable');
        delivered.push({
          applicationId,
          body,
          interactionToken,
          mediaType,
          mediaUrl,
          viewUrl,
        });
      },
      sendFollowupMessage: async (
        applicationId: string,
        interactionToken: string,
        body: string,
      ) => {
        if (isPlatformDown) throw new Error('Discord unavailable');
        delivered.push({ applicationId, body, interactionToken });
      },
    } as unknown as IBotPlatformAdapter;
    const registry = {
      getAdapter: (platform: CredentialPlatform) =>
        platform === CredentialPlatform.DISCORD ? discord : undefined,
    } as unknown as BotPlatformAdapterRegistryService;
    const config = {
      get: (key: string) => (key === 'GENFEEDAI_APP_URL' ? appUrl : undefined),
    } as unknown as ConfigService;
    const logger = {
      error: () => undefined,
      log: () => undefined,
      warn: (message: string) => {
        warnings.push(message);
      },
    } as unknown as LoggerService;

    service = new BotCallbackResponderService(registry, store, config, logger);
  });

  it('does nothing for an ingredient no bot is waiting on', async () => {
    await service.sendCompletionResponse('ing-1', 'https://cdn/x.png', 'image');

    expect(delivered).toEqual([]);
  });

  it.each([
    ['image', 'https://app.genfeed.ai/library/images?asset=ing-1'],
    ['video', 'https://app.genfeed.ai/library/videos?asset=ing-1'],
  ] as const)(
    'answers the interaction with the finished %s and its app link',
    async (mediaType, viewUrl) => {
      callbacks.set('ing-1', claimFor(CredentialPlatform.DISCORD));

      await service.sendCompletionResponse(
        'ing-1',
        'https://cdn/result',
        mediaType,
      );

      expect(delivered).toEqual([
        {
          applicationId: 'app-1',
          body: `Here's your generated ${mediaType}!`,
          interactionToken: 'token-1',
          mediaType,
          mediaUrl: 'https://cdn/result',
          viewUrl,
        },
      ]);
      expect(callbacks.has('ing-1')).toBe(false);
    },
  );

  it('omits the app link when no app URL is configured', async () => {
    appUrl = undefined;
    callbacks.set('ing-1', claimFor(CredentialPlatform.DISCORD));

    await service.sendCompletionResponse('ing-1', 'https://cdn/x.png', 'image');

    expect(delivered[0]?.viewUrl).toBeUndefined();
  });

  it('answers a failed generation with its error', async () => {
    callbacks.set('ing-1', claimFor(CredentialPlatform.DISCORD));

    await service.sendErrorResponse('ing-1', 'Out of credits');

    expect(delivered).toEqual([
      {
        applicationId: 'app-1',
        body: 'Generation failed: Out of credits',
        interactionToken: 'token-1',
      },
    ]);
    expect(callbacks.has('ing-1')).toBe(false);
  });

  it.each([
    [
      'a completion',
      (responder: BotCallbackResponderService) =>
        responder.sendCompletionResponse('ing-1', 'https://cdn/x', 'image'),
    ],
    [
      'a failure',
      (responder: BotCallbackResponderService) =>
        responder.sendErrorResponse('ing-1', 'boom'),
    ],
  ])('answers two racing copies of %s once', async (_case, respond) => {
    callbacks.set('ing-1', claimFor(CredentialPlatform.DISCORD));

    await Promise.all([respond(service), respond(service)]);

    expect(delivered).toHaveLength(1);
  });

  it('keeps the interaction for a retry when the platform rejects the answer', async () => {
    const claimed = claimFor(CredentialPlatform.DISCORD);
    callbacks.set('ing-1', claimed);
    isPlatformDown = true;

    await service.sendCompletionResponse('ing-1', 'https://cdn/x', 'image');

    expect(delivered).toEqual([]);
    expect(callbacks.get('ing-1')).toBe(claimed);

    isPlatformDown = false;
    await service.sendErrorResponse('ing-1', 'late failure');

    expect(delivered).toEqual([
      expect.objectContaining({ body: 'Generation failed: late failure' }),
    ]);
  });

  it('keeps the interaction when its platform has no adapter', async () => {
    const claimed = claimFor(CredentialPlatform.SLACK);
    callbacks.set('ing-1', claimed);

    await service.sendErrorResponse('ing-1', 'boom');

    expect(delivered).toEqual([]);
    expect(callbacks.get('ing-1')).toBe(claimed);
  });

  it.each([
    ['an expired context', 0, false, 'not restoring expired callback context'],
    ['a refused restore', 60_000, true, 'abandoned callback context restore'],
  ])(
    'drops %s after a failed delivery',
    async (_case, remainingTtlMs, isRefused, warning) => {
      callbacks.set(
        'ing-1',
        claimFor(CredentialPlatform.DISCORD, remainingTtlMs),
      );
      isPlatformDown = true;
      isRestoreRefused = isRefused;

      await service.sendCompletionResponse('ing-1', 'https://cdn/x', 'image');

      expect(callbacks.has('ing-1')).toBe(false);
      expect(warnings).toContainEqual(expect.stringContaining(warning));
    },
  );

  it('restores a context that never expires', async () => {
    callbacks.set('ing-1', claimFor(CredentialPlatform.DISCORD, -1));
    isPlatformDown = true;

    await service.sendErrorResponse('ing-1', 'boom');

    expect(callbacks.get('ing-1')?.remainingTtlMs).toBe(-1);
  });
});
