import { IngredientCategory } from '@genfeedai/contracts';
import type {
  IChannelDeliveryRequest,
  IChannelDeliveryResponse,
  IReviewGatePendingEmailPayload,
} from '@genfeedai/contracts/interfaces';
import {
  buildSystemEmailHtml,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { Injectable } from '@nestjs/common';
import { DiscordService } from '@notifications/services/discord/discord.service';
import { ResendService } from '@notifications/services/resend/resend.service';
import { SlackService } from '@notifications/services/slack/slack.service';
import { TelegramService } from '@notifications/services/telegram/telegram.service';

/** A channel message this service cannot render; the delivery never retries. */
export class InvalidChannelMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = InvalidChannelMessageError.name;
  }
}

const NOT_CONFIGURED = 'channel_not_configured';

type Payload = IChannelDeliveryRequest['message']['payload'];

function readString(payload: Payload, key: string): string | undefined {
  const value: unknown = Reflect.get(payload, key);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readRecord(
  payload: Payload,
  key: string,
): Record<string, unknown> | undefined {
  const value: unknown = Reflect.get(payload, key);
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

/**
 * Renders and sends one durable channel delivery (#5197). The API's delivery
 * worker owns retry, dedup and the delivery record; this service only turns
 * `{ type, action, payload }` into a provider call and reports the outcome.
 */
@Injectable()
export class ChannelMessageDispatcherService {
  constructor(
    private readonly discordService: DiscordService,
    private readonly resendService: ResendService,
    private readonly slackService: SlackService,
    private readonly telegramService: TelegramService,
  ) {}

  async dispatch(
    request: IChannelDeliveryRequest,
  ): Promise<IChannelDeliveryResponse> {
    const { message } = request;
    switch (message.type) {
      case 'discord':
        return this.outcome(
          await this.dispatchDiscord(message.action, message.payload),
          request.idempotencyKey,
        );
      case 'email':
        return this.dispatchEmail(request);
      case 'slack':
        return this.outcome(
          await this.dispatchText(request, (chatId, text) =>
            this.slackService.sendMessage(chatId, text),
          ),
          request.idempotencyKey,
        );
      case 'telegram':
        return this.outcome(
          await this.dispatchText(request, (chatId, text) =>
            this.telegramService.sendMessage(chatId, text),
          ),
          request.idempotencyKey,
        );
    }
  }

  private outcome(
    isSent: boolean,
    idempotencyKey: string,
  ): IChannelDeliveryResponse {
    return isSent
      ? { messageId: idempotencyKey, status: 'delivered' }
      : { reason: NOT_CONFIGURED, status: 'skipped' };
  }

  private async dispatchText(
    request: IChannelDeliveryRequest,
    send: (chatId: string, text: string) => Promise<boolean>,
  ): Promise<boolean> {
    if (request.message.action !== 'send_message') {
      throw new InvalidChannelMessageError('Unsupported message action');
    }
    const chatId =
      request.destination ?? readString(request.message.payload, 'chatId');
    const text = readString(request.message.payload, 'message');
    if (!chatId || !text) {
      throw new InvalidChannelMessageError('Message needs a chat and text');
    }
    return send(chatId, text);
  }

  private async dispatchDiscord(
    action: string,
    payload: Payload,
  ): Promise<boolean> {
    switch (action) {
      case 'ingredient_notification': {
        const cdnUrl = readString(payload, 'cdnUrl');
        const ingredient = readRecord(payload, 'ingredient');
        const ingredientId =
          typeof ingredient?.id === 'string' ? ingredient.id : '';
        if (!cdnUrl || !ingredient || !ingredientId) {
          throw new InvalidChannelMessageError('Ingredient payload incomplete');
        }
        const category = readString(payload, 'category');
        return this.discordService.sendIngredientNotification(
          Object.values(IngredientCategory).find(
            (value) => value === category,
          ) ?? IngredientCategory.IMAGE,
          cdnUrl,
          {
            brand:
              ingredient.brand && typeof ingredient.brand === 'object'
                ? (ingredient.brand as { label?: string })
                : undefined,
            id: ingredientId,
            metadata:
              ingredient.metadata && typeof ingredient.metadata === 'object'
                ? (ingredient.metadata as {
                    duration?: number;
                    externalProvider?: string;
                    height?: number;
                    model?: string;
                    width?: number;
                  })
                : undefined,
            prompt:
              ingredient.prompt && typeof ingredient.prompt === 'object'
                ? (ingredient.prompt as { original?: string })
                : undefined,
            thumbnailUrl:
              typeof ingredient.thumbnailUrl === 'string'
                ? ingredient.thumbnailUrl
                : undefined,
          },
        );
      }
      case 'article_notification':
        if ('label' in payload && 'slug' in payload) {
          return this.discordService.sendArticleNotification(payload);
        }
        break;
      case 'vercel_notification':
        if ('embed' in payload) {
          return this.discordService.sendVercelNotification(payload.embed);
        }
        break;
      case 'user_notification':
        if ('id' in payload) {
          return this.discordService.sendUserCreatedNotification(payload);
        }
        break;
      case 'revenue_notification':
        if ('organizationId' in payload && 'amountMinor' in payload) {
          return this.discordService.sendRevenueNotification(payload);
        }
        break;
      case 'model_discovery':
        if ('modelKey' in payload) {
          return this.discordService.sendModelDiscoveryNotification(payload);
        }
        break;
      case 'low_credits_alert':
        if ('organizationId' in payload && 'balance' in payload) {
          return this.discordService.sendLowCreditsAlert(payload);
        }
        break;
      case 'streak_at_risk':
      case 'streak_broken':
      case 'streak_freeze_used':
      case 'streak_milestone': {
        const card = readRecord(payload, 'card');
        return this.discordService.sendStreakNotification({
          color: typeof card?.color === 'number' ? card.color : 0xf97316,
          description: String(card?.description ?? ''),
          title: String(card?.title ?? 'GenFeed streak'),
        });
      }
      default:
        throw new InvalidChannelMessageError('Unsupported Discord action');
    }
    throw new InvalidChannelMessageError('Discord payload incomplete');
  }

  private async dispatchEmail(
    request: IChannelDeliveryRequest,
  ): Promise<IChannelDeliveryResponse> {
    const { action, payload } = request.message;
    const email =
      action === 'send_email'
        ? this.renderPlainEmail(payload)
        : action === 'review_gate_pending' &&
            'workflowLabel' in payload &&
            'executionId' in payload
          ? this.renderReviewGatePendingEmail(payload)
          : null;
    if (!email) {
      throw new InvalidChannelMessageError('Unsupported email message');
    }
    const to = request.destination ?? readString(payload, 'to');
    if (!to) {
      throw new InvalidChannelMessageError('Email needs a recipient');
    }
    const emailId = await this.resendService.sendEmail({
      ...email,
      idempotencyKey: request.idempotencyKey,
      to,
    });
    return emailId
      ? { messageId: emailId, status: 'delivered' }
      : { reason: NOT_CONFIGURED, status: 'skipped' };
  }

  private renderPlainEmail(
    payload: Payload,
  ): { from?: string; html: string; subject: string; text?: string } | null {
    const html = readString(payload, 'html');
    if (!html) return null;
    return {
      from: readString(payload, 'from'),
      html,
      subject: readString(payload, 'subject') ?? 'Genfeed notification',
      text: readString(payload, 'text'),
    };
  }

  private renderReviewGatePendingEmail(
    payload: IReviewGatePendingEmailPayload,
  ): { html: string; subject: string; text: string } {
    const workflowLabel = String(payload.workflowLabel || 'workflow');
    const subject = `Review needed: ${workflowLabel}`;
    const captionPreview =
      typeof payload.captionPreview === 'string' && payload.captionPreview
        ? `<blockquote>${escapeSystemEmailHtml(payload.captionPreview)}</blockquote>`
        : '';
    const reviewUrl =
      typeof payload.reviewUrl === 'string' && payload.reviewUrl.length > 0
        ? payload.reviewUrl
        : undefined;
    return {
      html: buildSystemEmailHtml({
        action: reviewUrl
          ? { label: 'Open Review', url: reviewUrl }
          : undefined,
        bodyHtml: `<p>A step in your workflow <strong>${escapeSystemEmailHtml(
          workflowLabel,
        )}</strong> is waiting for your review before it can continue.</p>${captionPreview}`,
        title: subject,
      }),
      subject,
      text: `A step in your workflow ${workflowLabel} is waiting for your review before it can continue.`,
    };
  }
}
