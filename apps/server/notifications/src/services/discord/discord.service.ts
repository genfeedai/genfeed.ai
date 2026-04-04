import { IngredientCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

@Injectable()
export class DiscordService {
  private readonly constructorName = DiscordService.name;

  constructor(
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly discordBotService: DiscordBotService,
  ) {
    if (this.configService.isDiscordEnabled()) {
      this.loggerService.log('Discord service initialized with bot webhooks');
    } else {
      this.loggerService.warn(
        'Discord service is not configured - notifications disabled',
      );
    }
  }

  async sendIngredientNotification(
    category: IngredientCategory,
    cdnUrl: string,
    ingredient: {
      _id: string;
      prompt?: { original?: string };
      metadata?: {
        width?: number;
        height?: number;
        duration?: number;
        model?: string;
        externalProvider?: string;
      };
      thumbnailUrl?: string;
      brand?: { label?: string };
    },
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const webhookClient = await this.discordBotService.getIngredientsWebhook();

    if (!webhookClient) {
      this.loggerService.log(`${url} skipped - webhook not available`);
      return;
    }

    try {
      const embedColor = this.getIngredientEmbedColor(category);

      const categoryString =
        category.charAt(0).toUpperCase() + category.slice(1);

      const embedTitle = `New ${categoryString} Generated`;

      const fields = this.buildIngredientFields(ingredient);

      const managerUrl = this.configService.get('GENFEEDAI_APP_URL');
      const ingredientManagerUrl = managerUrl
        ? `${managerUrl}/ingredients/${categoryString}/${ingredient._id}`
        : null;

      const buttons = this.buildIngredientButtons(
        category,
        cdnUrl,
        ingredientManagerUrl,
      );

      const embed: unknown = {
        color: embedColor,
        timestamp: new Date().toISOString(),
        title: embedTitle,
        url: ingredientManagerUrl || cdnUrl,
      };

      if (fields.length > 0) {
        embed.fields = fields;
      }

      if (category === IngredientCategory.IMAGE) {
        embed.image = { url: cdnUrl };
      } else if (category === IngredientCategory.VIDEO) {
        if (ingredient.thumbnailUrl) {
          embed.image = { url: ingredient.thumbnailUrl };
        }
      }

      const avatarUrl = this.configService.get('DISCORD_BOT_AVATAR_URL');

      // For videos: post video URL first (allows Discord auto-embed), then details
      if (category === IngredientCategory.VIDEO) {
        // First message: just the video URL for Discord to auto-embed
        await webhookClient.send({
          avatarURL: avatarUrl,
          content: cdnUrl,
          username: 'Genfeed.ai',
        });

        // Second message: embed with details and buttons
        const detailsPayload: unknown = {
          avatarURL: avatarUrl,
          embeds: [embed],
          username: 'Genfeed.ai',
        };

        if (buttons.length > 0) {
          const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...buttons,
          );
          detailsPayload.components = [actionRow];
        }

        await webhookClient.send(detailsPayload);
      } else {
        // For images: single message with embed
        const messagePayload: unknown = {
          avatarURL: avatarUrl,
          embeds: [embed],
          username: 'Genfeed.ai',
        };

        if (buttons.length > 0) {
          const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...buttons,
          );
          messagePayload.components = [actionRow];
        }

        await webhookClient.send(messagePayload);
      }

      this.loggerService.log(`${url} succeeded`, {
        category,
        cdnUrl,
        ingredientId: ingredient._id,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  async sendPostCard(post: {
    platform: string;
    externalId: string;
    description?: string;
    mediaUrl?: string;
    platforms?: Array<{ platform: string; url: string }>;
  }): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const webhookClient = await this.discordBotService.getPostsWebhook();

    if (!webhookClient) {
      this.loggerService.log(`${url} skipped - webhook not available`);
      return;
    }

    this.loggerService.log(`${url} received post data`, {
      externalId: post.externalId,
      hasDescription: !!post.description,
      hasMediaUrl: !!post.mediaUrl,
      platform: post.platform,
      platformsCount: post.platforms?.length || 0,
    });

    try {
      const platformNames: Record<string, string> = {
        FACEBOOK: 'Facebook',
        INSTAGRAM: 'Instagram',
        LINKEDIN: 'LinkedIn',
        TIKTOK: 'TikTok',
        TWITTER: 'X (Twitter)',
        YOUTUBE: 'YouTube',
      };

      const platformColors: Record<string, number> = {
        FACEBOOK: 0x1877f2,
        INSTAGRAM: 0xe4405f,
        LINKEDIN: 0x0077b5,
        TIKTOK: 0x000000,
        TWITTER: 0x000000,
        YOUTUBE: 0xff0000,
      };

      const normalizedPlatform = (post.platform || '').toUpperCase();
      const platformName =
        platformNames[normalizedPlatform] ||
        this.formatPlatformName(post.platform);

      const canonicalPlatformUrl =
        post.platforms?.find(({ url }) => url)?.url ||
        this.buildPlatformUrl(post.platform, post.externalId);

      const platformCount = post.platforms?.length || 1;
      const embedColor =
        platformCount > 1
          ? 0x5865f2
          : platformColors[normalizedPlatform] || 0x5865f2;

      const title =
        platformCount > 1
          ? `Published to ${platformCount} Platforms`
          : `Published to ${platformName}`;

      const embed: unknown = {
        color: embedColor,
        description:
          post.description?.substring(0, 300) ||
          'Content published successfully',
        timestamp: new Date().toISOString(),
        title,
      };

      if (canonicalPlatformUrl) {
        embed.url = canonicalPlatformUrl;
      }

      if (post.mediaUrl) {
        const isImage = post.mediaUrl.includes('/images/');
        if (isImage) {
          embed.image = { url: post.mediaUrl };
        }
      }

      const actionRow = new ActionRowBuilder<ButtonBuilder>();

      if (post.platforms?.length) {
        post.platforms
          .filter(({ url }) => url)
          .slice(0, 5)
          .forEach(({ platform, url }) => {
            const platformKey = (platform || '').toUpperCase();
            const platformDisplayName =
              platformNames[platformKey] || this.formatPlatformName(platform);

            actionRow.addComponents(
              new ButtonBuilder()
                .setLabel(platformDisplayName)
                .setStyle(ButtonStyle.Link)
                .setURL(url),
            );
          });
      }

      if (post.mediaUrl?.includes('/videos/')) {
        if (actionRow.components.length < 5) {
          actionRow.addComponents(
            new ButtonBuilder()
              .setLabel('View Video')
              .setStyle(ButtonStyle.Link)
              .setURL(post.mediaUrl),
          );
        }
      }

      if (actionRow.components.length === 0 && canonicalPlatformUrl) {
        actionRow.addComponents(
          new ButtonBuilder()
            .setLabel(`View on ${platformName}`)
            .setStyle(ButtonStyle.Link)
            .setURL(canonicalPlatformUrl),
        );
      }

      const messagePayload: unknown = {
        embeds: [embed],
      };

      if (canonicalPlatformUrl) {
        messagePayload.content = canonicalPlatformUrl;
      }

      if (actionRow.components.length > 0) {
        messagePayload.components = [actionRow];
      }

      await webhookClient.send(messagePayload);

      this.loggerService.log(`${url} succeeded`, {
        hasMedia: !!post.mediaUrl,
        platform: post.platform,
        platformCount: post.platforms?.length || 0,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  async sendVercelNotification(_embed: unknown): Promise<void> {
    // Vercel Discord webhook removed — notifications disabled
  }

  async sendChromaticNotification(_embed: unknown): Promise<void> {
    // Chromatic Discord webhook removed — notifications disabled
  }

  async sendStreakNotification(input: {
    title: string;
    description: string;
    color?: number;
  }): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const webhookClient = await this.discordBotService.getPostsWebhook();

    if (!webhookClient) {
      this.loggerService.log(`${url} skipped - webhook not available`);
      return;
    }

    try {
      await webhookClient.send({
        avatarURL: this.configService.get('DISCORD_BOT_AVATAR_URL'),
        embeds: [
          {
            color: input.color ?? 0xf97316,
            description: input.description,
            timestamp: new Date().toISOString(),
            title: input.title,
          },
        ],
        username: 'Genfeed.ai',
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  private formatPlatformName(platform?: string): string {
    if (!platform) {
      return 'Platform';
    }
    return `${platform.charAt(0).toUpperCase()}${platform.slice(1)}`;
  }

  private readonly platformUrlTemplates: Record<string, string> = {
    facebook: 'https://www.facebook.com/{id}',
    instagram: 'https://www.instagram.com/p/{id}/',
    linkedin: 'https://www.linkedin.com/feed/update/{id}',
    tiktok: 'https://www.tiktok.com/video/{id}',
    twitter: 'https://x.com/i/status/{id}',
    youtube: 'https://www.youtube.com/watch?v={id}',
  };

  private buildPlatformUrl(
    platform?: string,
    externalId?: string,
  ): string | null {
    if (!platform || !externalId) {
      return null;
    }

    const template = this.platformUrlTemplates[platform.toLowerCase()];
    return template ? template.replace('{id}', externalId) : null;
  }

  private getIngredientEmbedColor(category: IngredientCategory): number {
    const colorMap: Record<IngredientCategory, number> = {
      [IngredientCategory.IMAGE]: 0x00ff00,
      [IngredientCategory.VIDEO]: 0x0099ff,
      [IngredientCategory.AUDIO]: 0xff00ff,
    };
    return colorMap[category] ?? 0xff00ff;
  }

  private buildIngredientFields(ingredient: {
    prompt?: { original?: string };
    metadata?: {
      width?: number;
      height?: number;
      duration?: number;
      model?: string;
      externalProvider?: string;
    };
    brand?: { label?: string };
  }): Array<{ name: string; value: string; inline: boolean }> {
    const fields: Array<{ name: string; value: string; inline: boolean }> = [];

    if (ingredient.prompt?.original) {
      const escapedPrompt = ingredient.prompt.original.replace(/`/g, "'");
      const truncatedPrompt =
        escapedPrompt.length > 1020
          ? `${escapedPrompt.substring(0, 1020)}...`
          : escapedPrompt;

      fields.push({ inline: false, name: 'Prompt', value: truncatedPrompt });
    }

    if (ingredient.metadata?.model) {
      fields.push({
        inline: true,
        name: 'Model',
        value: ingredient.metadata.model,
      });
    }

    if (ingredient.metadata?.externalProvider) {
      fields.push({
        inline: true,
        name: 'Provider',
        value: ingredient.metadata.externalProvider,
      });
    }

    if (ingredient.brand?.label) {
      fields.push({
        inline: true,
        name: 'Brand',
        value: ingredient.brand.label,
      });
    }

    if (ingredient.metadata?.width && ingredient.metadata?.height) {
      fields.push({
        inline: true,
        name: 'Dimensions',
        value: `${ingredient.metadata.width}x${ingredient.metadata.height}`,
      });
    }

    if (ingredient.metadata?.duration) {
      fields.push({
        inline: true,
        name: 'Duration',
        value: `${ingredient.metadata.duration}s`,
      });
    }

    return fields;
  }

  private buildIngredientButtons(
    category: IngredientCategory,
    cdnUrl: string,
    managerUrl: string | null,
  ): ButtonBuilder[] {
    const buttons: ButtonBuilder[] = [];

    if (category === IngredientCategory.VIDEO) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('Watch Video')
          .setStyle(ButtonStyle.Link)
          .setURL(cdnUrl),
      );
    }

    if (category === IngredientCategory.IMAGE) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('View Full Image')
          .setStyle(ButtonStyle.Link)
          .setURL(cdnUrl),
      );
    }

    if (managerUrl) {
      buttons.push(
        new ButtonBuilder()
          .setLabel('Open in Manager')
          .setStyle(ButtonStyle.Link)
          .setURL(managerUrl),
      );
    }

    return buttons;
  }

  async sendModelDiscoveryNotification(payload: {
    modelKey: string;
    category: string;
    estimatedCost: number;
    providerCostUsd: number;
    provider: string;
    qualityTier?: string;
    speedTier?: string;
  }): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const webhookClient = await this.discordBotService.getModelsWebhook();

    if (!webhookClient) {
      this.loggerService.log(`${url} skipped - webhook not available`);
      return;
    }

    try {
      const providerColors: Record<string, number> = {
        fal: 0x7c3aed,
        replicate: 0x2563eb,
      };

      const providerName = payload.provider === 'fal' ? 'fal.ai' : 'Replicate';
      const embedColor = providerColors[payload.provider] || 0x5865f2;
      const margin =
        payload.providerCostUsd > 0
          ? Math.round(
              (1 - payload.providerCostUsd / (payload.estimatedCost * 0.01)) *
                100,
            )
          : 0;

      const fields: Array<{ name: string; value: string; inline: boolean }> = [
        { inline: true, name: 'Category', value: payload.category },
        { inline: true, name: 'Provider', value: providerName },
        {
          inline: true,
          name: 'Credits',
          value: `${payload.estimatedCost} ($${(payload.estimatedCost * 0.01).toFixed(2)})`,
        },
        {
          inline: true,
          name: 'Provider Cost',
          value: `$${payload.providerCostUsd.toFixed(4)}`,
        },
        { inline: true, name: 'Margin', value: `${margin}%` },
      ];

      if (payload.qualityTier) {
        fields.push({
          inline: true,
          name: 'Quality',
          value: payload.qualityTier,
        });
      }
      if (payload.speedTier) {
        fields.push({ inline: true, name: 'Speed', value: payload.speedTier });
      }

      const embed: Record<string, unknown> = {
        color: embedColor,
        fields,
        footer: { text: 'Draft created — activate in admin panel' },
        timestamp: new Date().toISOString(),
        title: `New Model Discovered: ${payload.modelKey}`,
      };

      const avatarUrl = this.configService.get('DISCORD_BOT_AVATAR_URL');

      await webhookClient.send({
        avatarURL: avatarUrl,
        embeds: [embed],
        username: 'Genfeed.ai',
      });

      this.loggerService.log(`${url} succeeded`, {
        modelKey: payload.modelKey,
        provider: payload.provider,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  async sendArticleNotification(article: {
    label: string;
    slug: string;
    summary?: string;
    category?: string;
    publicUrl?: string;
    thumbnailUrl?: string;
  }): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const webhookClient = await this.discordBotService.getPostsWebhook();

    if (!webhookClient) {
      this.loggerService.log(`${url} skipped - webhook not available`);
      return;
    }

    try {
      const articleUrl =
        article.publicUrl || `https://genfeed.ai/articles/${article.slug}`;

      const embed: unknown = {
        color: 0xff6b00, // Orange for articles
        timestamp: new Date().toISOString(),
        title: article.label,
        url: articleUrl,
      };

      if (article.summary) {
        embed.description = article.summary.substring(0, 300);
      }

      if (article.category) {
        embed.footer = { text: article.category };
      }

      if (article.thumbnailUrl) {
        embed.image = { url: article.thumbnailUrl };
      }

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Read Article')
          .setStyle(ButtonStyle.Link)
          .setURL(articleUrl),
      );

      const messagePayload: unknown = {
        components: [actionRow],
        embeds: [embed],
      };

      await webhookClient.send(messagePayload);

      this.loggerService.log(`${url} succeeded`, {
        articleSlug: article.slug,
        articleUrl,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  async sendLowCreditsAlert(payload: {
    organizationId: string;
    balance: number;
  }): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const webhookClient = await this.discordBotService.getUsersWebhook();

    if (!webhookClient) {
      this.loggerService.log(`${url} skipped - webhook not available`);
      return;
    }

    try {
      const managerUrl = this.configService.get('GENFEEDAI_APP_URL');
      const billingUrl = managerUrl
        ? `${managerUrl}/settings/organization/billing`
        : 'https://app.genfeed.ai/settings/organization/billing';

      const isCritical = payload.balance === 0;

      const embed: Record<string, unknown> = {
        color: isCritical ? 0xff0000 : 0xffa500,
        description: isCritical
          ? 'An organization has run out of credits.'
          : `An organization is running low on credits (**${payload.balance}** remaining).`,
        fields: [
          {
            inline: true,
            name: 'Organization',
            value: payload.organizationId,
          },
          {
            inline: true,
            name: 'Balance',
            value: `${payload.balance} credits`,
          },
        ],
        timestamp: new Date().toISOString(),
        title: isCritical ? 'Credits Depleted' : 'Low Credits Alert',
      };

      const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setLabel('Top Up')
          .setStyle(ButtonStyle.Link)
          .setURL(billingUrl),
      );

      const avatarUrl = this.configService.get('DISCORD_BOT_AVATAR_URL');

      await webhookClient.send({
        avatarURL: avatarUrl,
        components: [actionRow],
        embeds: [embed],
        username: 'Genfeed.ai',
      });

      this.loggerService.log(`${url} succeeded`, {
        balance: payload.balance,
        organizationId: payload.organizationId,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }

  async sendUserCreatedNotification(user: {
    _id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    isInvited?: boolean;
  }): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    const webhookClient = await this.discordBotService.getUsersWebhook();

    if (!webhookClient) {
      this.loggerService.log(`${url} skipped - webhook not available`);
      return;
    }

    try {
      const displayName =
        [user.firstName, user.lastName].filter(Boolean).join(' ') ||
        user.email ||
        'New User';

      const managerUrl = this.configService.get('GENFEEDAI_APP_URL');
      const userManagerUrl = managerUrl
        ? `${managerUrl}/admin/users/${user._id}`
        : null;

      const embed: unknown = {
        color: user.isInvited ? 0x5865f2 : 0x00ff00,
        description: `**${displayName}**${user.email ? `\n${user.email}` : ''}`,
        timestamp: new Date().toISOString(),
        title: user.isInvited ? 'Member Joined' : 'New User Signed Up',
      };

      if (user.avatar) {
        embed.thumbnail = { url: user.avatar };
      }

      if (userManagerUrl) {
        embed.url = userManagerUrl;
      }

      const buttons: ButtonBuilder[] = [];

      if (userManagerUrl) {
        buttons.push(
          new ButtonBuilder()
            .setLabel('View in Admin')
            .setStyle(ButtonStyle.Link)
            .setURL(userManagerUrl),
        );
      }

      const messagePayload: unknown = {
        embeds: [embed],
      };

      if (buttons.length > 0) {
        const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          ...buttons,
        );
        messagePayload.components = [actionRow];
      }

      await webhookClient.send(messagePayload);

      this.loggerService.log(`${url} succeeded`, {
        email: user.email,
        isInvited: user.isInvited,
        userId: user._id,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
    }
  }
}
