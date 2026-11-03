import { IngredientCategory } from '@genfeedai/contracts';
import type {
  DiscordTestChannel,
  IDiscordChannelTestResult,
  IDiscordEmbed,
  IDiscordTransportStatus,
  IIngredientNotificationData,
  IOperatorCardInput,
  IRevenueNotificationPayload,
  IStoryboardNotificationContext,
  IUserCreatedPayload,
} from '@genfeedai/contracts/interfaces';
import type { SystemEvent } from '@libs/interfaces/system-event.interface';
import { LoggerService } from '@libs/logger/logger.service';
import {
  downloadDiscordAttachment,
  type IDiscordMediaAttachment,
} from '@libs/security/discord-media-attachment';
import { discordWebhookUrl } from '@libs/security/discord-webhook-url';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { DiscordBotService } from '@notifications/services/discord/discord-bot.service';
import {
  buildIngredientButtons,
  buildIngredientFields,
  getIngredientEmbedColor,
} from '@notifications/services/discord/ingredient-card.util';
import {
  adminOrganizationUrl,
  adminUserUrl,
  buildOperatorCard,
  formatCredits,
} from '@notifications/services/discord/operator-card.util';
import { discordMessage } from '@notifications/services/discord/system-notification.util';
import { NotificationRuntimeSettingsService } from '@notifications/services/runtime-settings/notification-runtime-settings.service';
import {
  ActionRowBuilder,
  ButtonBuilder,
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

  async status(): Promise<IDiscordTransportStatus> {
    const settings = await this.runtimeSettings.get();
    // Billing is left out: unset, its alerts post to the users channel.
    const channels = {
      deployments: settings.discordChannelIdDeployments,
      models: settings.discordChannelIdModels,
      posts: settings.discordChannelIdPosts,
      studio: settings.discordChannelIdStudio,
      users: settings.discordChannelIdUsers,
    };
    return {
      isBotConfigured: this.configService.isDiscordEnabled(),
      isBotReady: this.discordBotService.botReady,
      missingChannels: Object.entries(channels)
        .filter(([, channelId]) => !channelId)
        .map(([name]) => name),
    };
  }

  /**
   * Posts a test message to one bot channel and says why it could not, so the
   * operator sees a failure the skipped-alert warning only logs.
   */
  async sendChannelTest(
    channel: DiscordTestChannel,
  ): Promise<IDiscordChannelTestResult> {
    const settings = await this.runtimeSettings.get();
    const channelIds: Record<DiscordTestChannel, string | null | undefined> = {
      billing: settings.discordChannelIdBilling,
      deployments: settings.discordChannelIdDeployments,
      models: settings.discordChannelIdModels,
      posts: settings.discordChannelIdPosts,
      studio: settings.discordChannelIdStudio,
      users: settings.discordChannelIdUsers,
    };
    if (!channelIds[channel])
      return { reason: 'channel_id_missing', status: 'skipped' };
    if (!this.configService.isDiscordEnabled())
      return { reason: 'bot_not_configured', status: 'skipped' };
    if (!this.discordBotService.botReady)
      return { reason: 'bot_not_ready', status: 'skipped' };

    const webhooks: Record<
      DiscordTestChannel,
      () => Promise<WebhookClient | null>
    > = {
      billing: () => this.discordBotService.getBillingWebhook(),
      deployments: () => this.discordBotService.getDeploymentsWebhook(),
      models: () => this.discordBotService.getModelsWebhook(),
      posts: () => this.discordBotService.getPostsWebhook(),
      studio: () => this.discordBotService.getIngredientsWebhook(),
      users: () => this.discordBotService.getUsersWebhook(),
    };
    const webhookClient = await webhooks[channel]();
    if (!webhookClient)
      return { reason: 'channel_unreachable', status: 'skipped' };

    try {
      await webhookClient.send({
        avatarURL: settings.discordBotAvatarUrl ?? undefined,
        embeds: [
          {
            description: `Test message for the ${channel} channel. Alerts for it will post here.`,
            timestamp: new Date().toISOString(),
            title: 'Genfeed.ai Discord test',
          },
        ],
        username: 'Genfeed.ai',
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${this.constructorName} test message to ${channel} failed`,
        error,
      );
      return { reason: 'send_failed', status: 'skipped' };
    }
    return { status: 'delivered' };
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
    storyboard?: IStoryboardNotificationContext,
  ): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getIngredientsWebhook(),
      url,
      async (webhookClient) => {
        const embedColor = getIngredientEmbedColor(category);

        const categoryString =
          category.charAt(0).toUpperCase() + category.slice(1);

        const embedTitle = `New ${categoryString} Generated`;

        const fields = buildIngredientFields(ingredient);

        const managerUrl = this.configService.get('GENFEEDAI_APP_URL');
        const ingredientManagerUrl = managerUrl
          ? `${managerUrl}/ingredients/${categoryString}/${ingredient.id}`
          : null;

        const appUrl = this.configService.get('GENFEEDAI_APP_URL');
        const layoutUrl =
          storyboard?.layoutPath && appUrl
            ? `${appUrl}${storyboard.layoutPath}`
            : null;

        const buttons = buildIngredientButtons(ingredientManagerUrl, layoutUrl);

        const embed: IDiscordEmbed = {
          color: embedColor,
          timestamp: new Date().toISOString(),
          title: embedTitle,
        };

        if (ingredientManagerUrl) {
          embed.url = ingredientManagerUrl;
        }

        if (fields.length > 0) {
          embed.fields = fields;
        }

        const still = await this.attachIngredientStill(
          category,
          cdnUrl,
          ingredient,
          embed,
          url,
        );

        const avatarUrl =
          (await this.runtimeSettings.get()).discordBotAvatarUrl ?? undefined;

        // A storyboard's stills share one thread; without one they fall back
        // to the channel like any other generation.
        let threadId = storyboard
          ? ((await this.discordBotService.getStoryboardThread({
              layoutUrl,
              runId: storyboard.runId,
              title: storyboard.title,
            })) ?? undefined)
          : undefined;

        // The cached thread can be deleted or locked after it was opened:
        // drop it so the next still opens a fresh one, and post this one to
        // the channel instead of failing the delivery.
        const send = async (
          payload: WebhookMessageCreateOptions,
        ): Promise<void> => {
          if (!threadId || !storyboard) {
            await webhookClient.send(payload);
            return;
          }
          try {
            await webhookClient.send({ ...payload, threadId });
          } catch (error: unknown) {
            this.loggerService.warn(
              `${url} thread post failed; posting to the channel`,
              {
                error: error instanceof Error ? error.message : String(error),
                runId: storyboard.runId,
              },
            );
            this.discordBotService.evictStoryboardThread(storyboard.runId);
            threadId = undefined;
            await webhookClient.send(payload);
          }
        };

        // A separate video message lets Discord play the video before its details.
        if (category === IngredientCategory.VIDEO) {
          const video = await downloadDiscordAttachment(
            cdnUrl,
            `${ingredient.id}-video`,
            'video',
          );
          if (video) {
            await send({
              avatarURL: avatarUrl,
              files: [video],
              username: 'Genfeed.ai',
            });
          }
        }

        const messagePayload: WebhookMessageCreateOptions = {
          avatarURL: avatarUrl,
          embeds: [embed],
          ...(still ? { files: [still] } : {}),
          username: 'Genfeed.ai',
        };

        if (buttons.length > 0) {
          const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
            ...buttons,
          );
          messagePayload.components = [actionRow];
        }

        await send(messagePayload);

        this.loggerService.log(`${url} succeeded`, {
          category,
          ingredientId: ingredient.id,
        });
      },
    );
  }

  /**
   * The media URLs are short-lived grants that expire before anyone may open
   * the card, so the still is attached rather than linked. Without one the
   * card posts with no image.
   */
  private async attachIngredientStill(
    category: IngredientCategory,
    cdnUrl: string,
    ingredient: IIngredientNotificationData,
    embed: IDiscordEmbed,
    context: string,
  ): Promise<IDiscordMediaAttachment | null> {
    const source =
      category === IngredientCategory.IMAGE
        ? cdnUrl
        : category === IngredientCategory.VIDEO
          ? ingredient.thumbnailUrl
          : undefined;
    if (!source) return null;
    const still = await downloadDiscordAttachment(
      source,
      ingredient.id,
      'image',
    );
    if (!still) {
      this.loggerService.warn(
        `${context} media unavailable; posting no image`,
        {
          category,
          ingredientId: ingredient.id,
        },
      );
      return null;
    }
    embed.image = { url: `attachment://${still.name}` };
    return still;
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
        await this.sendOperatorCard(webhookClient, {
          color: input.color ?? 0xf97316,
          summary: input.description,
          title: input.title,
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
      this.loggerService.warn(
        `${context} skipped - webhook not available. Check DISCORD_BOT_TOKEN and the Discord channel setting in Admin > Platform settings.`,
      );
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

        await this.sendOperatorCard(webhookClient, {
          color: embedColor,
          fields: [
            { name: 'Category', value: payload.category },
            { name: 'Provider', value: providerName },
            {
              name: 'Credits',
              value: `${payload.estimatedCost} ($${(payload.estimatedCost * 0.01).toFixed(2)})`,
            },
            {
              name: 'Provider Cost',
              value: `$${payload.providerCostUsd.toFixed(4)}`,
            },
            { name: 'Margin', value: `${margin}%` },
            { name: 'Quality', value: payload.qualityTier ?? '' },
            { name: 'Speed', value: payload.speedTier ?? '' },
          ],
          footer: 'Draft created — activate in admin panel',
          title: `New Model Discovered: ${payload.modelKey}`,
        });

        this.loggerService.log(`${url} succeeded`, {
          modelKey: payload.modelKey,
          provider: payload.provider,
        });
      },
    );
  }

  /**
   * A provider changed a price (#6196). The approved rate keeps charging; the
   * operator approves the new one from the admin model pricing page.
   */
  async sendModelPriceChangeNotification(payload: {
    modelKey: string;
    provider: string;
    changes: Array<{
      variant: string;
      unit: string;
      oldPriceUsd: number | null;
      newPriceUsd: number | null;
    }>;
    sourceUrl: string | null;
  }): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getModelsWebhook(),
      url,
      async (webhookClient) => {
        const ruleOnlyChange = payload.changes.length === 0;
        const formatPrice = (value: number | null): string =>
          value === null
            ? 'none'
            : `$${value.toLocaleString('en-US', { maximumFractionDigits: 10 })}`;
        // Discord caps an embed field value at 1024 characters.
        const lines = payload.changes
          .slice(0, 12)
          .map(
            (change) =>
              `${change.variant}: ${formatPrice(change.oldPriceUsd)} → ${formatPrice(change.newPriceUsd)} per ${change.unit}`,
          );
        if (payload.changes.length > lines.length)
          lines.push(`and ${payload.changes.length - lines.length} more`);
        await this.sendOperatorCard(webhookClient, {
          color: 0xffa500,
          fields: [
            { name: 'Provider', value: payload.provider },
            {
              inline: false,
              name: ruleOnlyChange ? 'Billing rules' : 'Old → new price',
              value: ruleOnlyChange
                ? 'Provider billing selectors or defaults changed. Review the pending contract in admin.'
                : lines.join('\n'),
            },
            { inline: false, name: 'Source', value: payload.sourceUrl ?? '' },
          ],
          summary: ruleOnlyChange
            ? 'The approved pricing keeps charging until a superadmin approves the pending contract.'
            : 'The approved rate keeps charging until a superadmin approves the new price.',
          title: ruleOnlyChange
            ? `Provider billing rules changed: ${payload.modelKey}`
            : `Provider price changed: ${payload.modelKey}`,
        });

        this.loggerService.log(`${url} succeeded`, {
          modelKey: payload.modelKey,
          provider: payload.provider,
        });
      },
    );
  }

  /** An active model became unpriceable, or its provider price refresh failed (#6196). */
  async sendModelPricingUnavailableNotification(payload: {
    modelKey: string;
    provider: string;
    reason: string;
  }): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getModelsWebhook(),
      url,
      async (webhookClient) => {
        await this.sendOperatorCard(webhookClient, {
          color: 0xef4444,
          fields: [{ name: 'Provider', value: payload.provider }],
          summary: payload.reason,
          title: `Model pricing needs attention: ${payload.modelKey}`,
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

        await webhookClient.send(
          buildOperatorCard({
            action: { label: 'Read Article', url: articleUrl },
            color: 0xff6b00, // Orange for articles
            footer: article.category,
            imageUrl: article.thumbnailUrl,
            summary: article.summary?.substring(0, 300),
            title: article.label,
          }),
        );

        this.loggerService.log(`${url} succeeded`, {
          articleSlug: article.slug,
          articleUrl,
        });
      },
    );
  }

  async sendLowCreditsAlert(payload: {
    organizationId: string;
    organizationLabel?: string;
    balance: number;
  }): Promise<boolean> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    return this.withWebhook(
      await this.discordBotService.getBillingWebhook(),
      url,
      async (webhookClient) => {
        const appUrl =
          this.configService.get('GENFEEDAI_APP_URL') ||
          'https://app.genfeed.ai';
        const isCritical = payload.balance <= 0;
        const organization =
          payload.organizationLabel || payload.organizationId;
        const balance = formatCredits(payload.balance);
        const organizationUrl = adminOrganizationUrl(
          appUrl,
          payload.organizationId,
        );

        await this.sendOperatorCard(webhookClient, {
          action: organizationUrl
            ? { label: 'View in Admin', url: organizationUrl }
            : undefined,
          color: isCritical ? 0xff0000 : 0xffa500,
          fields: [
            { name: 'Organization', value: organization },
            { name: 'Balance', value: `${balance} credits` },
          ],
          summary: isCritical
            ? `${organization} has run out of credits.`
            : `${organization} is running low on credits (**${balance}** remaining).`,
          title: isCritical ? 'Credits Depleted' : 'Low Credits Alert',
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
        const name =
          user.name ||
          [user.firstName, user.lastName].filter(Boolean).join(' ');
        const userUrl = adminUserUrl(
          this.configService.get('GENFEEDAI_APP_URL'),
          user.id,
        );
        const verb = user.isInvited ? 'joined a workspace' : 'signed up';

        await this.sendOperatorCard(webhookClient, {
          action: userUrl
            ? { label: 'View in Admin', url: userUrl }
            : undefined,
          color: user.isInvited ? 0x5865f2 : 0x00ff00,
          fields: [
            { name: 'Name', value: name },
            { name: 'Email', value: user.email ?? '' },
            { name: 'Organization', value: user.organizationLabel ?? '' },
          ],
          summary: name ? `**${name}** ${verb}.` : `A new user ${verb}.`,
          thumbnailUrl: user.avatar,
          title: user.isInvited ? 'Member Joined' : 'New User Signed Up',
        });

        this.loggerService.log(`${url} succeeded`, {
          email: user.email,
          isInvited: user.isInvited,
          userId: user.id,
        });
      },
    );
  }

  /** Posts a card from {@link buildOperatorCard} as the Genfeed.ai bot. */
  private async sendOperatorCard(
    webhookClient: WebhookClient,
    card: IOperatorCardInput,
  ): Promise<void> {
    await webhookClient.send({
      ...buildOperatorCard(card),
      avatarURL:
        (await this.runtimeSettings.get()).discordBotAvatarUrl ?? undefined,
      username: 'Genfeed.ai',
    });
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
      await this.discordBotService.getBillingWebhook(),
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
        const organizationUrl = adminOrganizationUrl(
          this.configService.get('GENFEEDAI_APP_URL'),
          revenue.organizationId,
        );

        await this.sendOperatorCard(webhookClient, {
          action: organizationUrl
            ? { label: 'View in Admin', url: organizationUrl }
            : undefined,
          color: 0x2ecc71,
          fields: [
            {
              name: 'Organization',
              value: revenue.organizationLabel || revenue.organizationId,
            },
            { name: 'Amount', value: amount },
            { name: 'Source', value: sourceLabel },
            { name: 'Plan', value: revenue.planLabel ?? '' },
          ],
          summary: revenue.planLabel
            ? `**${amount}** — ${revenue.planLabel} (${sourceLabel})`
            : `**${amount}** — ${sourceLabel}`,
          title: 'Revenue Received',
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
