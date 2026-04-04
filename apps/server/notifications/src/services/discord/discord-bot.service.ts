import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
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
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.configService.isDiscordEnabled()) {
      this.loggerService.warn(
        'Discord bot not configured - notifications disabled',
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

  /**
   * Get or create a bot-owned webhook for a channel
   */
  async getOrCreateWebhook(
    channelId: string,
    webhookName: string,
  ): Promise<WebhookClient | null> {
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
          reason: 'Genfeed.ai notification webhook',
        });
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

  getPostsWebhook(): Promise<WebhookClient | null> {
    return this.getOrCreateWebhook(
      this.configService.get('DISCORD_CHANNEL_ID_POSTS'),
      'Posts',
    );
  }

  getIngredientsWebhook(): Promise<WebhookClient | null> {
    return this.getOrCreateWebhook(
      this.configService.get('DISCORD_CHANNEL_ID_STUDIO'),
      'Studio',
    );
  }

  getUsersWebhook(): Promise<WebhookClient | null> {
    return this.getOrCreateWebhook(
      this.configService.get('DISCORD_CHANNEL_ID_USERS'),
      'Users',
    );
  }

  getModelsWebhook(): Promise<WebhookClient | null> {
    const channelId =
      this.configService.get('DISCORD_CHANNEL_ID_MODELS') ||
      this.configService.get('DISCORD_CHANNEL_ID_STUDIO');
    return this.getOrCreateWebhook(channelId, 'Models');
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
        channelId: this.configService.get('DISCORD_CHANNEL_ID_POSTS'),
        name: 'POSTS',
      },
      {
        channelId: this.configService.get('DISCORD_CHANNEL_ID_STUDIO'),
        name: 'STUDIO',
      },
      {
        channelId: this.configService.get('DISCORD_CHANNEL_ID_USERS'),
        name: 'USERS',
      },
    ];

    const results = await Promise.all(
      channels.map(async ({ name, channelId }) => ({
        name,
        ...(await this.testChannel(channelId)),
      })),
    );

    return { channels: results, success: true };
  }
}
