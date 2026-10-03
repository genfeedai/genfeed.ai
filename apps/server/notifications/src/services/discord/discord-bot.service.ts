import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { NotificationRuntimeSettingsService } from '@notifications/services/runtime-settings/notification-runtime-settings.service';
import {
  ChannelType,
  Client,
  Events,
  GatewayIntentBits,
  NewsChannel,
  PermissionFlagsBits,
  TextChannel,
  WebhookClient,
} from 'discord.js';

interface WebhookCache {
  client: WebhookClient;
  id: string;
  channelId: string;
}

@Injectable()
export class DiscordBotService implements OnModuleInit, OnModuleDestroy {
  private client: Client | null = null;
  private readonly webhookCache = new Map<string, WebhookCache>();
  private isReady = false;

  constructor(
    private readonly runtimeSettings: NotificationRuntimeSettingsService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.configService.isDiscordEnabled()) {
      this.loggerService.warn(
        this.configService.isDevelopment
          ? 'Discord bot disabled for local development (set GF_DEV_ENABLE_DISCORD=true to enable)'
          : 'Discord bot not configured - notifications disabled',
      );
      return;
    }
    await this.initializeBot();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.destroy();
    }
    for (const [, cache] of this.webhookCache) {
      cache.client.destroy();
    }
    this.webhookCache.clear();
  }

  private async initializeBot(): Promise<void> {
    try {
      this.client = new Client({
        intents: [GatewayIntentBits.Guilds],
      });

      this.client.once(Events.ClientReady, () => {
        this.isReady = true;
        this.loggerService.log(
          `Discord bot logged in as ${this.client?.user?.tag}`,
        );
      });

      await this.client.login(this.configService.get('DISCORD_BOT_TOKEN'));
    } catch (error: unknown) {
      this.loggerService.error('Failed to initialize Discord bot', error);
    }
  }

  private async getWebhookName(name: string): Promise<string> {
    const prefix = (await this.runtimeSettings.get()).discordWebhookNamePrefix;
    return prefix ? `${prefix} ${name}` : name;
  }

  private async getWebhookReason(): Promise<string> {
    return (
      (await this.runtimeSettings.get()).discordWebhookReason ||
      'Notification webhook'
    );
  }

  /**
   * Get or create a bot-owned webhook for a channel
   */
  async getOrCreateWebhook(
    channelId: string | undefined,
    webhookName: string,
  ): Promise<WebhookClient | null> {
    if (!channelId) {
      return null;
    }

    const cacheKey = `${channelId}:${webhookName}`;

    const cached = this.webhookCache.get(cacheKey);
    if (cached) {
      return cached.client;
    }

    if (!this.client || !this.isReady) {
      return null;
    }

    try {
      const channel = await this.client.channels.fetch(channelId);

      if (
        !channel ||
        (!(channel instanceof TextChannel) && !(channel instanceof NewsChannel))
      ) {
        this.loggerService.error(
          `Channel ${channelId} not found or not a text channel`,
        );
        return null;
      }

      const webhooks = await channel.fetchWebhooks();
      let webhook = webhooks.find(
        (wh) =>
          wh.owner?.id === this.client?.user?.id && wh.name === webhookName,
      );

      if (!webhook) {
        webhook = await channel.createWebhook({
          name: webhookName,
          reason: await this.getWebhookReason(),
        });
      }

      if (this.webhookCache.size >= 20) {
        for (const cached of this.webhookCache.values())
          cached.client.destroy();
        this.webhookCache.clear();
      }
      const webhookClient = new WebhookClient({ url: webhook.url });
      this.webhookCache.set(cacheKey, {
        channelId,
        client: webhookClient,
        id: webhook.id,
      });

      return webhookClient;
    } catch (error: unknown) {
      this.loggerService.error(
        `Failed to get/create webhook for channel ${channelId}`,
        error,
      );
      return null;
    }
  }

  clearWebhookCache(channelId: string, webhookName: string): void {
    const cacheKey = `${channelId}:${webhookName}`;
    const cached = this.webhookCache.get(cacheKey);
    if (cached) {
      cached.client.destroy();
      this.webhookCache.delete(cacheKey);
    }
  }

  async getPostsWebhook(): Promise<WebhookClient | null> {
    if (!this.client || !this.isReady) return null;
    return this.getOrCreateWebhook(
      (await this.runtimeSettings.get()).discordChannelIdPosts ?? undefined,
      await this.getWebhookName('Posts'),
    );
  }

  async getDeploymentsWebhook(): Promise<WebhookClient | null> {
    if (!this.client || !this.isReady) return null;
    return this.getOrCreateWebhook(
      (await this.runtimeSettings.get()).discordChannelIdDeployments ??
        undefined,
      await this.getWebhookName('Deployments'),
    );
  }

  async getIngredientsWebhook(): Promise<WebhookClient | null> {
    if (!this.client || !this.isReady) return null;
    return this.getOrCreateWebhook(
      (await this.runtimeSettings.get()).discordChannelIdStudio ?? undefined,
      await this.getWebhookName('Studio'),
    );
  }

  async getUsersWebhook(): Promise<WebhookClient | null> {
    if (!this.client || !this.isReady) return null;
    return this.getOrCreateWebhook(
      (await this.runtimeSettings.get()).discordChannelIdUsers ?? undefined,
      await this.getWebhookName('Users'),
    );
  }

  async getModelsWebhook(): Promise<WebhookClient | null> {
    if (!this.client || !this.isReady) return null;
    const channelId =
      ((await this.runtimeSettings.get()).discordChannelIdModels ||
        (await this.runtimeSettings.get()).discordChannelIdStudio) ??
      undefined;
    return this.getOrCreateWebhook(
      channelId,
      await this.getWebhookName('Models'),
    );
  }

  get botReady(): boolean {
    return this.isReady;
  }

  /**
   * Test channel access - used by dev controller
   */
  async testChannel(channelId: string): Promise<{
    success: boolean;
    channelId: string;
    channelName?: string;
    channelType?: string;
    botPermissions?: Record<string, boolean>;
    error?: string;
  }> {
    if (!this.client || !this.isReady) {
      return { channelId, error: 'Bot not ready', success: false };
    }

    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel) {
        return { channelId, error: 'Channel not found', success: false };
      }

      const channelName =
        'name' in channel ? (channel.name ?? undefined) : undefined;
      let botPermissions: Record<string, boolean> | undefined;

      if ('guild' in channel && channel.guild && this.client.user) {
        const member = await channel.guild.members.fetch(this.client.user.id);
        const permissions = channel.permissionsFor(member);

        if (permissions) {
          botPermissions = {
            AttachFiles: permissions.has(PermissionFlagsBits.AttachFiles),
            EmbedLinks: permissions.has(PermissionFlagsBits.EmbedLinks),
            ManageWebhooks: permissions.has(PermissionFlagsBits.ManageWebhooks),
            SendMessages: permissions.has(PermissionFlagsBits.SendMessages),
            ViewChannel: permissions.has(PermissionFlagsBits.ViewChannel),
          };
        }
      }

      return {
        botPermissions,
        channelId,
        channelName,
        channelType: ChannelType[channel.type],
        success: true,
      };
    } catch (error: unknown) {
      return {
        channelId,
        error: (error as Error)?.message || 'Unknown error',
        success: false,
      };
    }
  }

  /**
   * Get all configured channels - used by dev controller
   */
  async getAllConfiguredChannels(): Promise<{
    success: boolean;
    channels: Array<{
      name: string;
      channelId: string;
      channelName?: string;
      channelType?: string;
      botPermissions?: Record<string, boolean>;
      error?: string;
    }>;
  }> {
    const channels = [
      {
        channelId:
          (await this.runtimeSettings.get()).discordChannelIdPosts ?? undefined,
        name: 'POSTS',
      },
      {
        channelId:
          (await this.runtimeSettings.get()).discordChannelIdStudio ??
          undefined,
        name: 'STUDIO',
      },
      {
        channelId:
          (await this.runtimeSettings.get()).discordChannelIdUsers ?? undefined,
        name: 'USERS',
      },
    ];

    const results = await Promise.all(
      channels
        .filter(
          (channel): channel is { channelId: string; name: string } =>
            !!channel.channelId,
        )
        .map(async ({ name, channelId }) => ({
          name,
          ...(await this.testChannel(channelId)),
        })),
    );

    return { channels: results, success: true };
  }
}
