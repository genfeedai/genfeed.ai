import { IngredientCategory } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
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

      await service.sendIngredientNotification(
        IngredientCategory.IMAGE,
        'https://cdn/img.png',
        { id: 'ing-1' },
      );

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('sendPostCard', () => {
    it('should skip when webhook is unavailable', async () => {
      mockDiscordBotService.getPostsWebhook.mockResolvedValue(null);
      const { service } = await createService();

      await service.sendPostCard({ externalId: 'p-1', platform: 'instagram' });

      expect(mockSend).not.toHaveBeenCalled();
    });

    it('should build a single-platform card with a canonical url button', async () => {
      const { service } = await createService();

      await service.sendPostCard({
        description: 'A great post',
        externalId: 'p-123',
        platform: 'instagram',
      });

      const payload = lastSendPayload();
      expect(payload.content).toBe('https://www.instagram.com/p/p-123/');
      expect(payload.components).toHaveLength(1);

      const embed = payload.embeds?.[0] as {
        color: number;
        description: string;
        title: string;
        url: string;
      };
      expect(embed.color).toBe(0xe4405f);
      expect(embed.title).toBe('Published to Instagram');
      expect(embed.description).toBe('A great post');
      expect(embed.url).toBe('https://www.instagram.com/p/p-123/');
    });

    it('should build a multi-platform card with per-platform buttons', async () => {
      const { service } = await createService();

      await service.sendPostCard({
        externalId: 'p-1',
        mediaUrl: 'https://cdn/images/pic.png',
        platform: 'twitter',
        platforms: [
          { platform: 'twitter', url: 'https://x.com/i/status/1' },
          { platform: 'linkedin', url: 'https://linkedin.com/feed/update/2' },
        ],
      });

      const payload = lastSendPayload();
      const embed = payload.embeds?.[0] as {
        color: number;
        image?: { url: string };
        title: string;
      };
      expect(embed.title).toBe('Published to 2 Platforms');
      expect(embed.color).toBe(0x5865f2);
      expect(embed.image).toEqual({ url: 'https://cdn/images/pic.png' });
    });

    it('should add a video button when media is a video', async () => {
      const { service } = await createService();

      await service.sendPostCard({
        externalId: 'p-1',
        mediaUrl: 'https://cdn/videos/vid.mp4',
        platform: 'youtube',
      });

      const payload = lastSendPayload();
      const row = payload.components?.[0] as unknown as {
        components: ReadonlyArray<{ data: { label?: string } }>;
      };
      const labels = row.components.map((button) => button.data.label);
      expect(labels).toContain('View Video');
    });

    it('should handle unknown platforms without canonical url', async () => {
      const { service } = await createService();

      await service.sendPostCard({
        externalId: 'p-9',
        platform: 'mastodon',
      });

      const payload = lastSendPayload();
      expect(payload.content).toBeUndefined();
      const embed = payload.embeds?.[0] as {
        description: string;
        title: string;
      };
      expect(embed.title).toBe('Published to Mastodon');
      expect(embed.description).toBe('Content published successfully');
    });

    it('should log error when webhook send fails', async () => {
      mockSend.mockRejectedValue(new Error('send failed'));
      const { service } = await createService();

      await service.sendPostCard({ externalId: 'p-1', platform: 'facebook' });

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

      await service.sendVercelNotification({ title: 'Deploy' });

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });

  describe('sendChromaticNotification', () => {
    it('should be a no-op', async () => {
      const { service } = await createService();

      await service.sendChromaticNotification({ title: 'Chromatic' });

      expect(mockSend).not.toHaveBeenCalled();
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

      await service.sendStreakNotification({
        color: 0x123456,
        description: 'desc',
        title: 'Streak',
      });

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
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

      await service.sendModelDiscoveryNotification(basePayload);

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

      await service.sendArticleNotification({
        label: 'Launch',
        publicUrl: 'https://blog.genfeed.ai/launch',
        slug: 'launch',
      });

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

      await service.sendLowCreditsAlert({ balance: 5, organizationId: 'o-1' });

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

      await service.sendUserCreatedNotification({ id: 'u-1' });

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.any(Error),
      );
    });
  });
});
