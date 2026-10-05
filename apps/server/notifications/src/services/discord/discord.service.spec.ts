import { IngredientCategory } from '@genfeedai/contracts';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import type { IDiscordEmbed } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import { NotificationRuntimeSettingsService } from '@notifications/services/runtime-settings/notification-runtime-settings.service';
import type { WebhookMessageCreateOptions } from 'discord.js';

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('testCaller'),
  },
}));

interface DiscordServiceHarness {
  service: DiscordService;
}

describe('DiscordService', () => {
  const mockSend = vi.fn();
  const mockWebhookClient = { send: mockSend };

  const mockConfigService = {
    get: vi.fn(),
    isDiscordEnabled: vi.fn().mockReturnValue(true),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockDiscordBotService = {
    getDeploymentsWebhook: vi.fn(),
    getIngredientsWebhook: vi.fn(),
    getModelsWebhook: vi.fn(),
    getPostsWebhook: vi.fn(),
    getUsersWebhook: vi.fn(),
  };

  async function createService(): Promise<DiscordServiceHarness> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DiscordService,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: NotificationRuntimeSettingsService,
          useValue: {
            get: async () => ({
              ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
              discordChannelIdPosts:
                mockConfigService.get('DISCORD_CHANNEL_ID_POSTS') || null,
              discordChannelIdStudio:
                mockConfigService.get('DISCORD_CHANNEL_ID_STUDIO') || null,
              discordChannelIdUsers:
                mockConfigService.get('DISCORD_CHANNEL_ID_USERS') || null,
              discordChannelIdModels:
                mockConfigService.get('DISCORD_CHANNEL_ID_MODELS') || null,
              discordChannelIdDeployments:
                mockConfigService.get('DISCORD_CHANNEL_ID_DEPLOYMENTS') || null,
              discordWebhookNamePrefix:
                mockConfigService.get('DISCORD_WEBHOOK_NAME_PREFIX') || null,
              discordWebhookReason:
                mockConfigService.get('DISCORD_WEBHOOK_REASON') || null,
              discordBotAvatarUrl:
                mockConfigService.get('DISCORD_BOT_AVATAR_URL') || null,
            }),
          },
        },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: DiscordBotService, useValue: mockDiscordBotService },
      ],
    }).compile();

    return { service: module.get<DiscordService>(DiscordService) };
  }

  function lastSendPayload(): WebhookMessageCreateOptions {
    return mockSend.mock.calls[
      mockSend.mock.calls.length - 1
    ][0] as WebhookMessageCreateOptions;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue(undefined);
    mockConfigService.isDiscordEnabled.mockReturnValue(true);
    mockConfigService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        DISCORD_BOT_AVATAR_URL: 'https://cdn/avatar.png',
        GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
      };
      return values[key];
    });
    mockDiscordBotService.getDeploymentsWebhook.mockResolvedValue(
      mockWebhookClient,
    );
    mockDiscordBotService.getIngredientsWebhook.mockResolvedValue(
      mockWebhookClient,
    );
    mockDiscordBotService.getModelsWebhook.mockResolvedValue(mockWebhookClient);
    mockDiscordBotService.getPostsWebhook.mockResolvedValue(mockWebhookClient);
    mockDiscordBotService.getUsersWebhook.mockResolvedValue(mockWebhookClient);
  });

  it('should be defined and log enabled initialization', async () => {
    const { service } = await createService();

    expect(service).toBeDefined();
    expect(mockLoggerService.log).toHaveBeenCalledWith(
      'Discord service initialized with bot webhooks',
    );
  });

  it('should not log initialization when Discord is disabled', async () => {
    mockConfigService.isDiscordEnabled.mockReturnValue(false);

    await createService();

    expect(mockLoggerService.log).not.toHaveBeenCalledWith(
      'Discord service initialized with bot webhooks',
    );
  });

  describe('sendIngredientNotification', () => {
    it('should propagate webhook lookup errors before delivery handling', async () => {
      const lookupError = new Error('webhook lookup failed');
      mockDiscordBotService.getIngredientsWebhook.mockRejectedValueOnce(
        lookupError,
      );
      const { service } = await createService();

      await expect(
        service.sendIngredientNotification(
          IngredientCategory.IMAGE,
          'https://cdn/img.png',
          { id: 'ing-1' },
        ),
      ).rejects.toBe(lookupError);

      expect(mockSend).not.toHaveBeenCalled();
      expect(mockLoggerService.error).not.toHaveBeenCalled();
    });

    it('should skip when webhook is unavailable', async () => {
      mockDiscordBotService.getIngredientsWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendIngredientNotification(
        IngredientCategory.IMAGE,
        'https://cdn/img.png',
        { id: 'ing-1' },
      );

      expect(mockSend).not.toHaveBeenCalled();
      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('skipped - webhook not available'),
      );
    });

    it('should send a single embed message with fields and buttons for images', async () => {
      const { service } = await createService();

      await service.sendIngredientNotification(
        IngredientCategory.IMAGE,
        'https://cdn/img.png',
        {
          brand: { label: 'Acme' },
          id: 'ing-1',
          metadata: {
            externalProvider: 'fal',
            height: 1024,
            model: 'flux',
            width: 768,
          },
          prompt: { original: 'a `quoted` prompt' },
        },
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const payload = lastSendPayload();
      expect(payload.avatarURL).toBe('https://cdn/avatar.png');
      expect(payload.username).toBe('Genfeed.ai');
      expect(payload.components).toHaveLength(1);

      const embed = payload.embeds?.[0] as {
        color: number;
        fields: Array<{ name: string; value: string }>;
        image?: { url: string };
        title: string;
        url: string;
      };
      expect(embed.color).toBe(0x00ff00);
      expect(embed.title).toBe(`New ${IngredientCategory.IMAGE} Generated`);
      expect(embed.image).toEqual({ url: 'https://cdn/img.png' });
      expect(embed.url).toContain(
        `/ingredients/${IngredientCategory.IMAGE}/ing-1`,
      );
      expect(embed.fields.map((field) => field.name)).toEqual([
        'Prompt',
        'Model',
        'Provider',
        'Brand',
        'Dimensions',
      ]);
      expect(embed.fields.find((field) => field.name === 'Prompt')?.value).toBe(
        "a 'quoted' prompt",
      );
    });

    it('should truncate prompts longer than 1020 characters', async () => {
      const { service } = await createService();

      await service.sendIngredientNotification(
        IngredientCategory.IMAGE,
        'https://cdn/img.png',
        { id: 'ing-1', prompt: { original: 'x'.repeat(1500) } },
      );

      const embed = lastSendPayload().embeds?.[0] as {
        fields: Array<{ name: string; value: string }>;
      };
      const prompt = embed.fields.find((field) => field.name === 'Prompt');
      expect(prompt?.value.endsWith('...')).toBe(true);
      expect(prompt?.value).toHaveLength(1023);
    });

    it('should send two messages for videos with duration field and thumbnail', async () => {
      const { service } = await createService();

      await service.sendIngredientNotification(
        IngredientCategory.VIDEO,
        'https://cdn/vid.mp4',
        {
          id: 'ing-2',
          metadata: { duration: 8 },
          thumbnailUrl: 'https://cdn/thumb.png',
        },
      );

      expect(mockSend).toHaveBeenCalledTimes(2);
      const firstPayload = mockSend.mock
        .calls[0][0] as WebhookMessageCreateOptions;
      expect(firstPayload.content).toBe('https://cdn/vid.mp4');
      expect(firstPayload.embeds).toBeUndefined();
      expect(lastSendPayload().content).toBeUndefined();

      const embed = lastSendPayload().embeds?.[0] as {
        color: number;
        fields: Array<{ name: string; value: string }>;
        image?: { url: string };
      };
      expect(embed.color).toBe(0x0099ff);
      expect(embed.image).toEqual({ url: 'https://cdn/thumb.png' });
      expect(embed.fields).toEqual([
        { inline: true, name: 'Duration', value: '8s' },
      ]);
    });

    it('should fall back to cdn url when app url is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const { service } = await createService();

      await service.sendIngredientNotification(
        IngredientCategory.AUDIO,
        'https://cdn/audio.mp3',
        { id: 'ing-3' },
      );

      const embed = lastSendPayload().embeds?.[0] as {
        color: number;
        url: string;
      };
      expect(embed.url).toBe('https://cdn/audio.mp3');
      expect(embed.color).toBe(0xff00ff);
    });

    it('should log error when webhook send fails', async () => {
      mockSend.mockRejectedValue(new Error('send failed'));
      const { service } = await createService();

      await expect(
        service.sendIngredientNotification(
          IngredientCategory.IMAGE,
          'https://cdn/img.png',
          { id: 'ing-1' },
        ),
      ).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('sendVercelNotification', () => {
    it('should skip when webhook is unavailable', async () => {
      mockDiscordBotService.getDeploymentsWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendVercelNotification({ title: 'Deploy' });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should forward the embed to the deployments webhook', async () => {
      const { service } = await createService();

      await service.sendVercelNotification({ title: 'Deploy succeeded' });

      expect(mockSend).toHaveBeenCalledWith({
        avatarURL: 'https://cdn/avatar.png',
        embeds: [{ title: 'Deploy succeeded' }],
        username: 'Genfeed.ai Deployments',
      });
    });

    it('should log error when webhook send fails', async () => {
      mockSend.mockRejectedValue(new Error('send failed'));
      const { service } = await createService();

      await expect(
        service.sendVercelNotification({ title: 'Deploy' }),
      ).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('sendStreakNotification', () => {
    it('should skip when webhook is unavailable', async () => {
      mockDiscordBotService.getPostsWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendStreakNotification({
        description: 'desc',
        title: 'Streak',
      });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should send an embed with default color', async () => {
      const { service } = await createService();

      await service.sendStreakNotification({
        description: '5 day streak',
        title: 'Streak milestone',
      });

      const embed = lastSendPayload().embeds?.[0] as {
        color: number;
        description: string;
        title: string;
      };
      expect(embed.color).toBe(0xf97316);
      expect(embed.title).toBe('Streak milestone');
      expect(embed.description).toBe('5 day streak');
    });

    it('should respect an explicit color and log send failures', async () => {
      mockSend.mockRejectedValue(new Error('send failed'));
      const { service } = await createService();

      await expect(
        service.sendStreakNotification({
          color: 0x123456,
          description: 'desc',
          title: 'Streak',
        }),
      ).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('model pricing alerts (#6196)', () => {
    it('lists old and new prices per variant with the source link', async () => {
      const { service } = await createService();

      await service.sendModelPriceChangeNotification({
        changes: [
          {
            newPriceUsd: 0.21,
            oldPriceUsd: 0.19,
            unit: 'output',
            variant: 'duration=6 · resolution=768P',
          },
          {
            newPriceUsd: null,
            oldPriceUsd: 0.33,
            unit: 'output',
            variant: 'duration=6 · resolution=1080P',
          },
        ],
        modelKey: 'minimax/hailuo-2.3-fast',
        provider: 'replicate',
        sourceUrl: 'https://replicate.com/minimax/hailuo-2.3-fast',
      });

      const embed = lastSendPayload().embeds?.[0] as {
        fields: Array<{ name: string; value: string }>;
        title: string;
      };
      expect(embed.title).toBe(
        'Provider price changed: minimax/hailuo-2.3-fast',
      );
      const fields = new Map(embed.fields.map((f) => [f.name, f.value]));
      expect(fields.get('Old → new price')).toBe(
        'duration=6 · resolution=768P: $0.19 → $0.21 per output\nduration=6 · resolution=1080P: $0.33 → none per output',
      );
      expect(fields.get('Source')).toBe(
        'https://replicate.com/minimax/hailuo-2.3-fast',
      );
    });

    it('reports an unpriceable or unrefreshable model', async () => {
      const { service } = await createService();

      await service.sendModelPricingUnavailableNotification({
        modelKey: 'minimax/hailuo-2.3-fast',
        provider: 'replicate',
        reason: 'unmapped_criterion:camera motion',
      });

      const embed = lastSendPayload().embeds?.[0] as {
        description: string;
        title: string;
      };
      expect(embed.title).toBe(
        'Model pricing needs attention: minimax/hailuo-2.3-fast',
      );
      expect(embed.description).toBe('unmapped_criterion:camera motion');
    });

    it('skips when the models webhook is unavailable', async () => {
      mockDiscordBotService.getModelsWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendModelPricingUnavailableNotification({
        modelKey: 'm',
        provider: 'fal',
        reason: 'r',
      });

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('sendModelDiscoveryNotification', () => {
    const basePayload = {
      category: 'image',
      estimatedCost: 10,
      modelKey: 'flux-dev',
      provider: 'fal',
      providerCostUsd: 0.05,
    };

    it('should skip when webhook is unavailable', async () => {
      mockDiscordBotService.getModelsWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendModelDiscoveryNotification(basePayload);

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should send model fields including margin for fal', async () => {
      const { service } = await createService();

      await service.sendModelDiscoveryNotification({
        ...basePayload,
        qualityTier: 'high',
        speedTier: 'fast',
      });

      const embed = lastSendPayload().embeds?.[0] as {
        color: number;
        fields: Array<{ name: string; value: string }>;
        title: string;
      };
      expect(embed.title).toBe('New Model Discovered: flux-dev');
      expect(embed.color).toBe(0x7c3aed);

      const fieldMap = new Map(
        embed.fields.map((field) => [field.name, field.value]),
      );
      expect(fieldMap.get('Provider')).toBe('fal.ai');
      expect(fieldMap.get('Credits')).toBe('10 ($0.10)');
      expect(fieldMap.get('Provider Cost')).toBe('$0.0500');
      expect(fieldMap.get('Margin')).toBe('50%');
      expect(fieldMap.get('Quality')).toBe('high');
      expect(fieldMap.get('Speed')).toBe('fast');
    });

    it('should report zero margin for replicate models without provider cost', async () => {
      const { service } = await createService();

      await service.sendModelDiscoveryNotification({
        ...basePayload,
        provider: 'replicate',
        providerCostUsd: 0,
      });

      const embed = lastSendPayload().embeds?.[0] as {
        color: number;
        fields: Array<{ name: string; value: string }>;
      };
      expect(embed.color).toBe(0x2563eb);
      const fieldMap = new Map(
        embed.fields.map((field) => [field.name, field.value]),
      );
      expect(fieldMap.get('Provider')).toBe('Replicate');
      expect(fieldMap.get('Margin')).toBe('0%');
    });

    it('should log error when webhook send fails', async () => {
      mockSend.mockRejectedValue(new Error('send failed'));
      const { service } = await createService();

      await expect(
        service.sendModelDiscoveryNotification(basePayload),
      ).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('sendArticleNotification', () => {
    it('should skip when webhook is unavailable', async () => {
      mockDiscordBotService.getPostsWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendArticleNotification({ label: 'A', slug: 'a' });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should build article embed with optional fields', async () => {
      const { service } = await createService();

      await service.sendArticleNotification({
        category: 'News',
        label: 'Launch',
        slug: 'launch',
        summary: 'Big launch',
        thumbnailUrl: 'https://cdn/thumb.png',
      });

      const payload = lastSendPayload();
      expect(payload.components).toHaveLength(1);
      const embed = payload.embeds?.[0] as {
        description: string;
        footer: { text: string };
        image: { url: string };
        title: string;
        url: string;
      };
      expect(embed.title).toBe('Launch');
      expect(embed.url).toBe('https://genfeed.ai/articles/launch');
      expect(embed.description).toBe('Big launch');
      expect(embed.footer).toEqual({ text: 'News' });
      expect(embed.image).toEqual({ url: 'https://cdn/thumb.png' });
    });

    it('should prefer an explicit public url and log send failures', async () => {
      mockSend.mockRejectedValue(new Error('send failed'));
      const { service } = await createService();

      await expect(
        service.sendArticleNotification({
          label: 'Launch',
          publicUrl: 'https://blog.genfeed.ai/launch',
          slug: 'launch',
        }),
      ).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('sendLowCreditsAlert', () => {
    it('should skip when webhook is unavailable', async () => {
      mockDiscordBotService.getUsersWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendLowCreditsAlert({ balance: 5, organizationId: 'o-1' });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should send a warning alert when balance is low', async () => {
      const { service } = await createService();

      await service.sendLowCreditsAlert({ balance: 5, organizationId: 'o-1' });

      const embed = lastSendPayload().embeds?.[0] as {
        color: number;
        description: string;
        title: string;
      };
      expect(embed.color).toBe(0xffa500);
      expect(embed.title).toBe('Low Credits Alert');
      expect(embed.description).toContain('**5** remaining');
    });

    it('should send a critical alert when balance is zero', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const { service } = await createService();

      await service.sendLowCreditsAlert({ balance: 0, organizationId: 'o-1' });

      const embed = lastSendPayload().embeds?.[0] as {
        color: number;
        title: string;
      };
      expect(embed.color).toBe(0xff0000);
      expect(embed.title).toBe('Credits Depleted');
    });

    it('should log error when webhook send fails', async () => {
      mockSend.mockRejectedValue(new Error('send failed'));
      const { service } = await createService();

      await expect(
        service.sendLowCreditsAlert({ balance: 5, organizationId: 'o-1' }),
      ).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('sendUserCreatedNotification', () => {
    it('should skip when webhook is unavailable', async () => {
      mockDiscordBotService.getUsersWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendUserCreatedNotification({ id: 'u-1' });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should send a signup embed with avatar and admin button', async () => {
      const { service } = await createService();

      await service.sendUserCreatedNotification({
        avatar: 'https://cdn/avatar-user.png',
        email: 'jane@example.com',
        firstName: 'Jane',
        id: 'u-1',
        lastName: 'Doe',
      });

      const payload = lastSendPayload();
      expect(payload.components).toHaveLength(1);
      const embed = payload.embeds?.[0] as {
        color: number;
        description: string;
        thumbnail: { url: string };
        title: string;
        url: string;
      };
      expect(embed.title).toBe('New User Signed Up');
      expect(embed.color).toBe(0x00ff00);
      expect(embed.description).toContain('**Jane Doe**');
      expect(embed.description).toContain('jane@example.com');
      expect(embed.thumbnail).toEqual({ url: 'https://cdn/avatar-user.png' });
      expect(embed.url).toBe('https://app.genfeed.ai/admin/users/u-1');
    });

    it('should mark invited members and omit buttons without app url', async () => {
      mockConfigService.get.mockReturnValue(undefined);
      const { service } = await createService();

      await service.sendUserCreatedNotification({
        id: 'u-2',
        isInvited: true,
      });

      const payload = lastSendPayload();
      expect(payload.components).toBeUndefined();
      const embed = payload.embeds?.[0] as {
        color: number;
        description: string;
        title: string;
      };
      expect(embed.title).toBe('Member Joined');
      expect(embed.color).toBe(0x5865f2);
      expect(embed.description).toContain('**New User**');
    });

    it('should log error when webhook send fails', async () => {
      mockSend.mockRejectedValue(new Error('send failed'));
      const { service } = await createService();

      await expect(
        service.sendUserCreatedNotification({ id: 'u-1' }),
      ).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('sendRevenueNotification (genfeedai/genfeed.ai#5313)', () => {
    function lastEmbed(): IDiscordEmbed {
      const embed = lastSendPayload().embeds?.[0] as IDiscordEmbed;
      expect(embed).toBeDefined();
      expect(embed.fields).toBeDefined();
      return embed;
    }

    function fieldValue(
      embed: IDiscordEmbed,
      name: string,
    ): string | undefined {
      return embed.fields?.find((field) => field.name === name)?.value;
    }

    it('formats a USD amount by dividing by 100 minor units', async () => {
      const { service } = await createService();

      await service.sendRevenueNotification({
        amountMinor: 4_500,
        currency: 'usd',
        organizationId: 'org_1',
        source: 'subscription_invoice',
      });

      const embed = lastEmbed();
      expect(fieldValue(embed, 'Amount')).toBe('$45.00');
    });

    it('formats a zero-decimal JPY amount without dividing by 100', async () => {
      const { service } = await createService();

      await service.sendRevenueNotification({
        amountMinor: 5_000,
        currency: 'jpy',
        organizationId: 'org_1',
        source: 'subscription_invoice',
      });

      const embed = lastEmbed();
      // JPY has no minor unit — Stripe's 5,000 already means ¥5,000, not ¥50.
      expect(fieldValue(embed, 'Amount')).toBe('¥5,000');
    });

    it('formats UGX using the standard two-decimal scale, per Stripe’s special case', async () => {
      const { service } = await createService();

      await service.sendRevenueNotification({
        amountMinor: 500,
        currency: 'ugx',
        organizationId: 'org_1',
        source: 'subscription_invoice',
      });

      const embed = lastEmbed();
      // UGX is a real-world zero-decimal currency, but Stripe's `amount` for
      // it stays two-decimal for backward compatibility: 500 means 5 UGX,
      // not 500 UGX (genfeedai/genfeed.ai#5313 review finding). Intl inserts
      // a non-breaking space (U+00A0) between an ISO currency code and the
      // amount, not a regular space.
      expect(fieldValue(embed, 'Amount')).toBe('UGX\u00a05');
    });

    it('formats ISK using the standard two-decimal scale, per Stripe’s special case', async () => {
      const { service } = await createService();

      await service.sendRevenueNotification({
        amountMinor: 500,
        currency: 'isk',
        organizationId: 'org_1',
        source: 'subscription_invoice',
      });

      const embed = lastEmbed();
      // Same backward-compatibility special case as UGX: 500 means 5 ISK.
      expect(fieldValue(embed, 'Amount')).toBe('ISK\u00a05');
    });

    it('formats a three-decimal KWD amount using a 1000 minor-unit scale', async () => {
      const { service } = await createService();

      await service.sendRevenueNotification({
        amountMinor: 1_500,
        currency: 'kwd',
        organizationId: 'org_1',
        source: 'subscription_invoice',
      });

      const embed = lastEmbed();
      // KWD has a three-digit minor unit — 1,500 means 1.500 KWD, not 15.00.
      expect(fieldValue(embed, 'Amount')).toBe('KWD\u00a01.500');
    });

    it('always shows the revenue source in the Source field, even with a plan label', async () => {
      const { service } = await createService();

      await service.sendRevenueNotification({
        amountMinor: 5_900,
        currency: 'usd',
        organizationId: 'org_1',
        planLabel: 'Pro',
        source: 'subscription_invoice',
      });

      const embed = lastEmbed();
      expect(fieldValue(embed, 'Source')).toBe('Subscription invoice');
      expect(fieldValue(embed, 'Plan')).toBe('Pro');
      expect(embed.description).toContain('Pro');
      expect(embed.description).toContain('Subscription invoice');
    });

    it('shows the formatted revenue source in Source and description when no plan label is known', async () => {
      const { service } = await createService();

      await service.sendRevenueNotification({
        amountMinor: 5_900,
        currency: 'usd',
        organizationId: 'org_1',
        source: 'credit_purchase',
      });

      const embed = lastEmbed();
      expect(fieldValue(embed, 'Source')).toBe('Credit purchase');
      expect(fieldValue(embed, 'Plan')).toBeUndefined();
      expect(embed.description).toContain('Credit purchase');
    });
  });
});
