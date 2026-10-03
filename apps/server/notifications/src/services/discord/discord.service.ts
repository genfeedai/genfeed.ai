import { IngredientCategory } from '@genfeedai/contracts';
import type {
  IDiscordEmbed,
  IDiscordEmbedField,
  IIngredientNotificationData,
  IRevenueNotificationPayload,
  IUserCreatedPayload,
} from '@genfeedai/contracts/interfaces';
import type { SystemEvent } from '@libs/interfaces/system-event.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { discordWebhookUrl } from '@libs/security/discord-webhook-url';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import { discordMessage } from '@notifications/services/discord/system-notification.util';
import { NotificationRuntimeSettingsService } from '@notifications/services/runtime-settings/notification-runtime-settings.service';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type WebhookClient,
  type WebhookMessageCreateOptions,
} from 'discord.js';

@Injectable()
export class DiscordService {
  private readonly constructorName = DiscordService.name;

  constructor(
    private readonly runtimeSettings: NotificationRuntimeSettingsService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
    private readonly discordBotService: DiscordBotService,
  ) {
    // Only the enabled path logs here. The "not configured" boot warning is
    // owned solely by DiscordBotService.onModuleInit — emitting it here too
    // double-warned on every boot with Discord disabled.
    if (this.configService.isDiscordEnabled()) {
      this.loggerService.log('Discord service initialized with bot webhooks');
    }
  }

  async sendSystemNotification(
    event: SystemEvent,
    webhookUrl: string,
  ): Promise<void> {
    const url = discordWebhookUrl(webhookUrl);
    if (!url)
      throw new ServiceUnavailableException(
        'System notification destination is not configured',
      );
    try {
      const response = await fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordMessage(event)),
        signal: AbortSignal.timeout(10_000),
      });
      await response.body?.cancel();
      if (!response.ok) throw new Error('Provider rejected delivery');
    } catch {
      throw new ServiceUnavailableException(
        'System notification delivery failed',
      );
    }
  }

  async sendIngredientNotification(
    category: IngredientCategory,
    cdnUrl: string,
    ingredient: IIngredientNotificationData,
  ): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getIngredientsWebhook(),
      url,
      async (webhookClient) => {
        const embedColor = this.getIngredientEmbedColor(category);

        const categoryString =
          category.charAt(0).toUpperCase() + category.slice(1);

        const embedTitle = `New ${categoryString} Generated`;

        const fields = this.buildIngredientFields(ingredient);

        const managerUrl = this.configService.get('GENFEEDAI_APP_URL');
        const ingredientManagerUrl = managerUrl
          ? `${managerUrl}/ingredients/${categoryString}/${ingredient.id}`
          : null;

        const buttons = this.buildIngredientButtons(
          category,
          cdnUrl,
          ingredientManagerUrl,
        );

        const embed: IDiscordEmbed = {
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

        const avatarUrl =
          (await this.runtimeSettings.get()).discordBotAvatarUrl ?? undefined;

        // A separate video URL message lets Discord embed the video before its details.
        if (category === IngredientCategory.VIDEO) {
          await webhookClient.send({
            avatarURL: avatarUrl,
            content: cdnUrl,
            username: 'Genfeed.ai',
          });
        }

        const messagePayload: WebhookMessageCreateOptions = {
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

        this.loggerService.log(`${url} succeeded`, {
          category,
          cdnUrl,
          ingredientId: ingredient.id,
        });
      },
    );
  }

  async sendVercelNotification(embed: IDiscordEmbed): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getDeploymentsWebhook(),
      url,
      async (webhookClient) => {
        await webhookClient.send({
          avatarURL:
            (await this.runtimeSettings.get()).discordBotAvatarUrl ?? undefined,
          embeds: [embed],
          username: 'Genfeed.ai Deployments',
        });
      },
    );
  }

  async sendStreakNotification(input: {
    title: string;
    description: string;
    color?: number;
  }): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getPostsWebhook(),
      url,
      async (webhookClient) => {
        await webhookClient.send({
          avatarURL:
            (await this.runtimeSettings.get()).discordBotAvatarUrl ?? undefined,
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
      },
    );
  }

  /**
   * Resolves `false` when the channel's webhook is not configured on this
   * deployment. Provider failures propagate so the durable delivery retries.
   */
  private async withWebhook(
    webhookClient: WebhookClient | null,
    context: string,
    send: (client: WebhookClient) => Promise<void>,
  ): Promise<boolean> {
    if (!webhookClient) {
      this.loggerService.log(`${context} skipped - webhook not available`);
      return false;
    }

    try {
      await send(webhookClient);
      return true;
    } catch (error: unknown) {
      this.loggerService.error(`${context} failed`, error);
      throw error;
    }
  }

  private getIngredientEmbedColor(category: IngredientCategory): number {
    const colorMap: Partial<Record<IngredientCategory, number>> = {
      [IngredientCategory.IMAGE]: 0x00ff00,
      [IngredientCategory.VIDEO]: 0x0099ff,
      [IngredientCategory.AUDIO]: 0xff00ff,
    };
    return colorMap[category] ?? 0xff00ff;
  }

  private buildIngredientFields(
    ingredient: IIngredientNotificationData,
  ): Array<{ name: string; value: string; inline: boolean }> {
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
  }): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getModelsWebhook(),
      url,
      async (webhookClient) => {
        const providerColors: Record<string, number> = {
          fal: 0x7c3aed,
          replicate: 0x2563eb,
        };

        const providerName =
          payload.provider === 'fal' ? 'fal.ai' : 'Replicate';
        const embedColor = providerColors[payload.provider] || 0x5865f2;
        const margin =
          payload.providerCostUsd > 0
            ? Math.round(
                (1 - payload.providerCostUsd / (payload.estimatedCost * 0.01)) *
                  100,
              )
            : 0;

        const fields: Array<{ name: string; value: string; inline: boolean }> =
          [
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
          fields.push({
            inline: true,
            name: 'Speed',
            value: payload.speedTier,
          });
        }

        const embed: Record<string, unknown> = {
          color: embedColor,
          fields,
          footer: { text: 'Draft created — activate in admin panel' },
          timestamp: new Date().toISOString(),
          title: `New Model Discovered: ${payload.modelKey}`,
        };

        const avatarUrl =
          (await this.runtimeSettings.get()).discordBotAvatarUrl ?? undefined;

        await webhookClient.send({
          avatarURL: avatarUrl,
          embeds: [embed],
          username: 'Genfeed.ai',
        });

        this.loggerService.log(`${url} succeeded`, {
          modelKey: payload.modelKey,
          provider: payload.provider,
        });
      },
    );
  }

  async sendArticleNotification(article: {
    label: string;
    slug: string;
    summary?: string;
    category?: string;
    publicUrl?: string;
    thumbnailUrl?: string;
  }): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getPostsWebhook(),
      url,
      async (webhookClient) => {
        const articleUrl =
          article.publicUrl || `https://genfeed.ai/articles/${article.slug}`;

        const embed: IDiscordEmbed = {
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

        const messagePayload: WebhookMessageCreateOptions = {
          components: [actionRow],
          embeds: [embed],
        };

        await webhookClient.send(messagePayload);

        this.loggerService.log(`${url} succeeded`, {
          articleSlug: article.slug,
          articleUrl,
        });
      },
    );
  }

  async sendLowCreditsAlert(payload: {
    organizationId: string;
    balance: number;
  }): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getUsersWebhook(),
      url,
      async (webhookClient) => {
        const managerUrl = this.configService.get('GENFEEDAI_APP_URL');
        const billingUrl = managerUrl
          ? `${managerUrl}/settings/subscription`
          : 'https://app.genfeed.ai/settings/subscription';

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

        const avatarUrl =
          (await this.runtimeSettings.get()).discordBotAvatarUrl ?? undefined;

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
      },
    );
  }

  async sendUserCreatedNotification(
    user: IUserCreatedPayload,
  ): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getUsersWebhook(),
      url,
      async (webhookClient) => {
        const displayName =
          [user.firstName, user.lastName].filter(Boolean).join(' ') ||
          user.email ||
          'New User';

        const managerUrl = this.configService.get('GENFEEDAI_APP_URL');
        const userManagerUrl = managerUrl
          ? `${managerUrl}/admin/users/${user.id}`
          : null;

        const embed: IDiscordEmbed = {
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

        const messagePayload: WebhookMessageCreateOptions = {
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
          userId: user.id,
        });
      },
    );
  }

  private static readonly REVENUE_SOURCE_LABELS: Record<string, string> = {
    credit_purchase: 'Credit purchase',
    subscription_invoice: 'Subscription invoice',
  };

  /**
   * Stripe currencies with no minor unit — the integer amount Stripe sends
   * already equals the major unit, so it must not be divided by 100.
   * https://docs.stripe.com/currencies#zero-decimal
   *
   * ISK and UGX are deliberately excluded even though both are real-world
   * zero-decimal currencies today: Stripe's documented special case for each
   * requires the `amount` to keep arriving in two-decimal form for backward
   * compatibility (e.g. `500` means 5 ISK / 5 UGX, not 500), so they use the
   * standard 100 scale below. HUF and TWD have their own special case, but
   * it only affects manual *payouts* — charge/invoice amounts for both stay
   * two-decimal, so neither belongs in this set either.
   * https://docs.stripe.com/currencies#special-cases
   */
  private static readonly ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> =
    new Set([
      'BIF',
      'CLP',
      'DJF',
      'GNF',
      'JPY',
      'KMF',
      'KRW',
      'MGA',
      'PYG',
      'RWF',
      'VND',
      'VUV',
      'XAF',
      'XOF',
      'XPF',
    ]);

  /**
   * Stripe currencies with a three-digit minor unit (1000 minor units per
   * major unit) instead of the usual two.
   * https://docs.stripe.com/currencies#special-cases
   */
  private static readonly THREE_DECIMAL_CURRENCIES: ReadonlySet<string> =
    new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND']);

  /** Stripe's minor-unit scale for `currency` — 1, 100, or 1000 per major unit. */
  private resolveMinorUnitScale(currency: string): number {
    if (DiscordService.ZERO_DECIMAL_CURRENCIES.has(currency)) {
      return 1;
    }
    if (DiscordService.THREE_DECIMAL_CURRENCIES.has(currency)) {
      return 1000;
    }
    return 100;
  }

  private formatRevenueAmount(amountMinor: number, currency: string): string {
    const normalizedCurrency = currency.trim().toUpperCase() || 'USD';
    const scale = this.resolveMinorUnitScale(normalizedCurrency);
    const majorAmount = amountMinor / scale;
    try {
      return new Intl.NumberFormat('en-US', {
        currency: normalizedCurrency,
        style: 'currency',
      }).format(majorAmount);
    } catch {
      const decimalDigits = scale === 1 ? 0 : scale === 1000 ? 3 : 2;
      return `${majorAmount.toFixed(decimalDigits)} ${normalizedCurrency}`;
    }
  }

  private formatRevenueSourceLabel(source: string): string {
    return DiscordService.REVENUE_SOURCE_LABELS[source] ?? source;
  }

  /** Operator alert for a completed Stripe checkout or paid invoice (genfeedai/genfeed.ai#4969). */
  async sendRevenueNotification(
    revenue: IRevenueNotificationPayload,
  ): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getUsersWebhook(),
      url,
      async (webhookClient) => {
        const amount = this.formatRevenueAmount(
          revenue.amountMinor,
          revenue.currency,
        );
        // The Source field always names the revenue event source — a plan
        // label (when known) is additive, shown in the description and its
        // own field, and must never replace Source (genfeedai/genfeed.ai#5313).
        const sourceLabel = this.formatRevenueSourceLabel(revenue.source);
        const description = revenue.planLabel
          ? `**${amount}** — ${revenue.planLabel} (${sourceLabel})`
          : `**${amount}** — ${sourceLabel}`;

        const fields: IDiscordEmbedField[] = [
          {
            inline: true,
            name: 'Organization',
            value: revenue.organizationId,
          },
          { inline: true, name: 'Amount', value: amount },
          { inline: true, name: 'Source', value: sourceLabel },
        ];

        if (revenue.planLabel) {
          fields.push({
            inline: true,
            name: 'Plan',
            value: revenue.planLabel,
          });
        }

        const embed: IDiscordEmbed = {
          color: 0x2ecc71,
          description,
          fields,
          timestamp: new Date().toISOString(),
          title: 'Revenue Received',
        };

        await webhookClient.send({
          avatarURL:
            (await this.runtimeSettings.get()).discordBotAvatarUrl ?? undefined,
          embeds: [embed],
          username: 'Genfeed.ai',
        });

        this.loggerService.log(`${url} succeeded`, {
          amountMinor: revenue.amountMinor,
          organizationId: revenue.organizationId,
          source: revenue.source,
        });
      },
    );
  }
}
