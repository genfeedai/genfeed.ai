import { IngredientCategory } from '@genfeedai/enums';
import type {
  ICrmLeadOutreachEmailPayload,
  IReviewGatePendingEmailPayload,
  IVideoStatusEmailPayload,
  IWorkflowStatusEmailPayload,
} from '@genfeedai/interfaces';
import {
  buildSystemEmailHtml,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscordService } from '@notifications/services/discord/discord.service';
import {
  isNotificationEvent,
  type NotificationEvent,
} from '@notifications/services/notification-handler.types';
import { ResendService } from '@notifications/services/resend/resend.service';
import { SlackService } from '@notifications/services/slack/slack.service';
import { TelegramService } from '@notifications/services/telegram/telegram.service';

@Injectable()
export class NotificationHandlerService implements OnModuleInit {
  private readonly context = { service: NotificationHandlerService.name };

  constructor(
    private readonly logger: LoggerService,
    private readonly redisService: RedisService,
    private readonly discordService: DiscordService,
    private readonly resendService: ResendService,
    private readonly slackService: SlackService,
    private readonly telegramService: TelegramService,
  ) {}

  async onModuleInit() {
    await this.subscribeToNotifications();
  }

  private async subscribeToNotifications() {
    await this.redisService.subscribe('notifications', (message: unknown) => {
      if (!isNotificationEvent(message)) {
        this.logger.warn(
          'Received malformed notification event - skipping',
          this.context,
        );
        return;
      }

      const event = message;

      this.logger.log(
        `Received notification event: ${event.type}:${event.action}`,
        this.context,
      );

      (async () => {
        try {
          await this.handleEvent(event);
        } catch (error: unknown) {
          this.logger.error(
            `Failed to handle event ${event.type}:${event.action}`,
            error,
            this.context,
          );

          const retryCount = event.retryCount ?? 0;
          if (retryCount < 3) {
            setTimeout(() => {
              this.redisService
                .publish('notifications', {
                  ...event,
                  retryCount: retryCount + 1,
                })
                .catch((err) =>
                  this.logger.error(
                    'Failed to publish retry notification',
                    err,
                    this.context,
                  ),
                );
            }, 5000 * Math.max(retryCount, 1));
          }
        }
      })().catch((err) =>
        this.logger.error(
          'Failed to process notification event',
          err,
          this.context,
        ),
      );
    });

    this.logger.log('Subscribed to all notification events', this.context);
  }

  private async handleEvent(event: NotificationEvent): Promise<void> {
    const handlers: Record<string, () => Promise<void> | void> = {
      chatbot: () => this.handleChatbotAction(event),
      discord: () => this.handleDiscordAction(event),
      email: () => this.handleEmailAction(event),
      slack: () => this.handleSlackAction(event),
      telegram: () => this.handleTelegramAction(event),
    };

    const handler = handlers[event.type];
    if (handler) {
      await handler();
    } else {
      this.logger.warn(`Unknown event type: ${event.type}`, this.context);
    }
  }

  private async handleDiscordAction(event: NotificationEvent): Promise<void> {
    const { action, payload } = event;

    switch (action) {
      case 'ingredient_notification': {
        if (!('cdnUrl' in payload) || !('ingredient' in payload)) {
          this.logger.warn(
            'ingredient_notification payload missing cdnUrl/ingredient - skipping',
            this.context,
          );
          break;
        }
        const category =
          typeof payload.category === 'string'
            ? (payload.category as IngredientCategory)
            : IngredientCategory.IMAGE;
        const ingredient = payload.ingredient as Record<string, unknown>;
        await this.discordService.sendIngredientNotification(
          category,
          payload.cdnUrl,
          {
            _id: String(ingredient._id || ''),
            brand:
              typeof ingredient.brand === 'object' && ingredient.brand !== null
                ? (ingredient.brand as { label?: string })
                : undefined,
            metadata:
              typeof ingredient.metadata === 'object' &&
              ingredient.metadata !== null
                ? (ingredient.metadata as {
                    width?: number;
                    height?: number;
                    duration?: number;
                    model?: string;
                    externalProvider?: string;
                  })
                : undefined,
            prompt:
              typeof ingredient.prompt === 'object' &&
              ingredient.prompt !== null
                ? (ingredient.prompt as { original?: string })
                : undefined,
            thumbnailUrl:
              typeof ingredient.thumbnailUrl === 'string'
                ? ingredient.thumbnailUrl
                : undefined,
          },
        );
        break;
      }

      case 'post_notification':
        if ('platform' in payload && 'externalId' in payload) {
          await this.discordService.sendPostCard(payload);
        }
        break;

      case 'article_notification':
        if ('label' in payload && 'slug' in payload) {
          await this.discordService.sendArticleNotification(payload);
        }
        break;

      case 'vercel_notification':
        if ('embed' in payload) {
          await this.discordService.sendVercelNotification(payload.embed);
        }
        break;

      case 'chromatic_notification':
        if ('embed' in payload) {
          await this.discordService.sendChromaticNotification(payload.embed);
        }
        break;

      case 'user_notification':
        if ('_id' in payload) {
          await this.discordService.sendUserCreatedNotification(payload);
        }
        break;

      case 'model_discovery':
        if ('modelKey' in payload) {
          await this.discordService.sendModelDiscoveryNotification(payload);
        }
        break;

      case 'low_credits_alert':
        if ('organizationId' in payload && 'balance' in payload) {
          await this.discordService.sendLowCreditsAlert(payload);
        }
        break;

      case 'streak_at_risk':
      case 'streak_broken':
      case 'streak_freeze_used':
      case 'streak_milestone': {
        // Streak events are published by StreaksService#sendDiscordNotification with a
        // `{ card: { color, description, title } }` payload shape that predates (and isn't
        // represented in) `INotificationPayloadTypes` — narrow defensively via `in` checks.
        const card =
          'card' in payload &&
          typeof payload.card === 'object' &&
          payload.card !== null
            ? (payload.card as {
                color?: unknown;
                description?: unknown;
                title?: unknown;
              })
            : undefined;
        await this.discordService.sendStreakNotification({
          color: typeof card?.color === 'number' ? card.color : 0xf97316,
          description: String(card?.description || ''),
          title: String(card?.title || 'GenFeed streak'),
        });
        break;
      }

      case 'send_card':
        this.logger.warn(
          'Received deprecated send_card action - use ingredient_notification instead',
          this.context,
        );
        break;

      default:
        this.logger.warn(`Unknown Discord action: ${action}`, this.context);
    }
  }

  private async handleTelegramAction(event: NotificationEvent): Promise<void> {
    const { action, payload } = event;

    switch (action) {
      // Neither branch below is currently reachable: no producer publishes
      // `ingredient_notification`/`post_notification` with `type: 'telegram'` (both are
      // Discord-only in notifications.service.ts today), but the fields are narrowed
      // defensively in case that changes.
      case 'ingredient_notification': {
        const chatId = 'chatId' in payload ? payload.chatId : undefined;
        const cdnUrl = 'cdnUrl' in payload ? payload.cdnUrl : undefined;
        const ingredientLabel =
          'ingredient' in payload &&
          typeof payload.ingredient === 'object' &&
          payload.ingredient !== null &&
          typeof (payload.ingredient as Record<string, unknown>).label ===
            'string'
            ? ((payload.ingredient as Record<string, unknown>).label as string)
            : undefined;
        if (typeof chatId === 'string' && typeof cdnUrl === 'string') {
          const caption = ingredientLabel
            ? `*${ingredientLabel}*\nGenerated with GenFeed AI`
            : 'Generated with GenFeed AI';
          await this.telegramService.sendPhoto(chatId, cdnUrl, caption);
        }
        break;
      }

      case 'post_notification': {
        const chatId = 'chatId' in payload ? payload.chatId : undefined;
        const title = 'title' in payload ? payload.title : undefined;
        const description =
          'description' in payload ? payload.description : undefined;
        if (typeof chatId === 'string') {
          const text =
            typeof title === 'string'
              ? `*New Post:* ${title}\n${typeof description === 'string' ? description : ''}`
              : 'New post published';
          await this.telegramService.sendMessage(chatId, text);
        }
        break;
      }

      case 'send_message':
        if ('chatId' in payload && 'message' in payload) {
          await this.telegramService.sendMessage(
            payload.chatId,
            payload.message,
          );
        }
        break;

      default:
        this.logger.warn(`Unknown Telegram action: ${action}`, this.context);
    }
  }

  private async handleEmailAction(event: NotificationEvent): Promise<void> {
    const { action, payload } = event;

    switch (action) {
      case 'send_email': {
        const from =
          'from' in payload && typeof payload.from === 'string'
            ? payload.from
            : undefined;
        const html =
          'html' in payload && typeof payload.html === 'string'
            ? payload.html
            : '';
        const subject =
          'subject' in payload && typeof payload.subject === 'string'
            ? payload.subject
            : 'Genfeed notification';
        const to =
          'to' in payload && typeof payload.to === 'string' ? payload.to : '';

        await this.resendService.sendEmail({ from, html, subject, to });
        break;
      }

      case 'crm_lead_outreach':
        if ('to' in payload && 'leadId' in payload && 'leadName' in payload) {
          await this.sendCrmLeadOutreachEmail(payload);
        }
        break;

      case 'video_status_email':
        if ('to' in payload && 'status' in payload && 'path' in payload) {
          await this.sendVideoStatusEmail(payload);
        }
        break;

      case 'workflow_status_email':
        if (
          'to' in payload &&
          'workflowId' in payload &&
          'workflowLabel' in payload &&
          'status' in payload
        ) {
          await this.sendWorkflowStatusEmail(payload);
        }
        break;

      case 'review_gate_pending':
        if (
          'to' in payload &&
          'workflowLabel' in payload &&
          'executionId' in payload
        ) {
          await this.sendReviewGatePendingEmail(payload);
        }
        break;

      case 'low_credits_alert':
        // NotificationsService#sendLowCreditsAlert publishes `{ balance, organizationId }`
        // for this action/type pair — `ILowCreditsAlertPayload` carries no recipient email
        // address, so this alert has never actually been deliverable via email. Surfacing
        // that explicitly rather than silently reading a field the payload never has.
        this.logger.warn(
          'low_credits_alert email skipped - ILowCreditsAlertPayload carries no recipient address',
          this.context,
        );
        break;

      default:
        this.logger.warn(`Unknown Email action: ${action}`, this.context);
    }
  }

  private async handleSlackAction(event: NotificationEvent): Promise<void> {
    const { action, payload } = event;

    // None of the branches below are currently reachable: no producer publishes any
    // action with `type: 'slack'` today (confirmed via repo-wide grep against
    // notifications.service.ts). `INotificationPayloadTypes` has no dedicated Slack
    // payload shape, so fields are narrowed defensively against the closest matching
    // union members (ingredient/post/telegram-message shapes) in case this is wired up.
    switch (action) {
      case 'ingredient_notification': {
        const channelId = 'chatId' in payload ? payload.chatId : undefined;
        const cdnUrl = 'cdnUrl' in payload ? payload.cdnUrl : undefined;
        const ingredientLabel =
          'ingredient' in payload &&
          typeof payload.ingredient === 'object' &&
          payload.ingredient !== null &&
          typeof (payload.ingredient as Record<string, unknown>).label ===
            'string'
            ? ((payload.ingredient as Record<string, unknown>).label as string)
            : undefined;
        if (typeof channelId === 'string' && typeof cdnUrl === 'string') {
          const comment = ingredientLabel
            ? `*${ingredientLabel}*\nGenerated with GenFeed AI`
            : 'Generated with GenFeed AI';
          await this.slackService.sendFile(channelId, cdnUrl, comment);
        }
        break;
      }

      case 'post_notification': {
        const channelId = 'chatId' in payload ? payload.chatId : undefined;
        const title = 'title' in payload ? payload.title : undefined;
        const description =
          'description' in payload ? payload.description : undefined;
        if (typeof channelId === 'string') {
          const text =
            typeof title === 'string'
              ? `*New Post:* ${title}\n${typeof description === 'string' ? description : ''}`
              : 'New post published';
          await this.slackService.sendMessage(channelId, text);
        }
        break;
      }

      case 'send_message':
        if ('chatId' in payload && 'message' in payload) {
          await this.slackService.sendMessage(payload.chatId, payload.message);
        }
        break;

      default:
        this.logger.warn(`Unknown Slack action: ${action}`, this.context);
    }
  }

  private handleChatbotAction(event: NotificationEvent): void {
    const { action } = event;

    switch (action) {
      case 'send_message':
        this.logger.warn(`Unhandled Chatbot action: ${action}`, this.context);
        break;

      default:
        this.logger.warn(`Unknown Chatbot action: ${action}`, this.context);
    }
  }

  private async sendCrmLeadOutreachEmail(
    payload: ICrmLeadOutreachEmailPayload,
  ): Promise<void> {
    const leadId = String(payload.leadId || '');
    const leadName = String(payload.leadName || 'there');
    const company =
      typeof payload.company === 'string' ? payload.company.trim() : '';
    const to = String(payload.to || '');
    const subject =
      typeof payload.subject === 'string' && payload.subject.trim().length > 0
        ? payload.subject
        : `Genfeed.ai for ${company || 'your team'}`;

    const html = this.wrapEmailTemplate({
      body: `<p>Hi ${this.escapeHtml(leadName)},</p><p>I wanted to reach out because Genfeed.ai can help ${this.escapeHtml(company || 'your team')} turn content workflows into something repeatable and faster.</p><p>If it’s useful, I can show you what that would look like for your use case.</p>`,
      title: subject,
    });

    await this.resendService.sendEmail({
      html,
      idempotencyKey: `crm-contacted/${leadId}`,
      subject,
      text: `Hi ${leadName}, I wanted to reach out because Genfeed.ai can help ${company || 'your team'} turn content workflows into something repeatable and faster.`,
      to,
    });
  }

  private async sendVideoStatusEmail(
    payload: IVideoStatusEmailPayload,
  ): Promise<void> {
    const status = String(payload.status || '');
    const isFailure = status === 'failed';
    const subject = isFailure
      ? 'Your Genfeed video failed'
      : 'Your Genfeed video is ready';
    const body = isFailure
      ? `<p>Your video job failed${payload.error ? `: ${this.escapeHtml(String(payload.error))}` : '.'}</p>`
      : `<p>Your video has finished processing and is ready.</p>`;

    await this.resendService.sendEmail({
      html: this.wrapEmailTemplate({
        body,
        ctaLabel:
          typeof payload.url === 'string' && payload.url.length > 0
            ? isFailure
              ? 'Open Genfeed'
              : 'View Video'
            : undefined,
        ctaUrl:
          typeof payload.url === 'string' && payload.url.length > 0
            ? payload.url
            : undefined,
        title: subject,
      }),
      idempotencyKey: `video-status/${String(payload.jobId || payload.path || subject)}/${status}`,
      subject,
      text: isFailure
        ? `Your video job failed${payload.error ? `: ${String(payload.error)}` : '.'}`
        : 'Your video has finished processing and is ready.',
      to: String(payload.to || ''),
    });
  }

  private async sendWorkflowStatusEmail(
    payload: IWorkflowStatusEmailPayload,
  ): Promise<void> {
    const status = String(payload.status || '');
    const isFailure = status === 'failed';
    const workflowLabel = String(payload.workflowLabel || 'workflow');
    const subject = isFailure
      ? `Workflow failed: ${workflowLabel}`
      : `Workflow completed: ${workflowLabel}`;
    const body = isFailure
      ? `<p>Your workflow <strong>${this.escapeHtml(workflowLabel)}</strong> failed${payload.error ? `: ${this.escapeHtml(String(payload.error))}` : '.'}</p>`
      : `<p>Your workflow <strong>${this.escapeHtml(workflowLabel)}</strong> completed successfully.</p>`;

    await this.resendService.sendEmail({
      html: this.wrapEmailTemplate({
        body,
        title: subject,
      }),
      idempotencyKey: `workflow-status/${String(payload.workflowId || workflowLabel)}/${status}`,
      subject,
      text: isFailure
        ? `Your workflow ${workflowLabel} failed${payload.error ? `: ${String(payload.error)}` : '.'}`
        : `Your workflow ${workflowLabel} completed successfully.`,
      to: String(payload.to || ''),
    });
  }

  private async sendReviewGatePendingEmail(
    payload: IReviewGatePendingEmailPayload,
  ): Promise<void> {
    const workflowLabel = String(payload.workflowLabel || 'workflow');
    const subject = `Review needed: ${workflowLabel}`;
    const captionPreview =
      typeof payload.captionPreview === 'string' && payload.captionPreview
        ? `<blockquote>${this.escapeHtml(payload.captionPreview)}</blockquote>`
        : '';
    const body = `<p>A step in your workflow <strong>${this.escapeHtml(
      workflowLabel,
    )}</strong> is waiting for your review before it can continue.</p>${captionPreview}`;
    const reviewUrl =
      typeof payload.reviewUrl === 'string' && payload.reviewUrl.length > 0
        ? payload.reviewUrl
        : undefined;

    await this.resendService.sendEmail({
      html: this.wrapEmailTemplate({
        body,
        ctaLabel: reviewUrl ? 'Open Review' : undefined,
        ctaUrl: reviewUrl,
        title: subject,
      }),
      idempotencyKey: `review-gate-pending/${String(
        payload.executionId || workflowLabel,
      )}/${String(payload.nodeId || '')}`,
      subject,
      text: `A step in your workflow ${workflowLabel} is waiting for your review before it can continue.`,
      to: String(payload.to || ''),
    });
  }

  private wrapEmailTemplate(input: {
    title: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }): string {
    return buildSystemEmailHtml({
      action:
        input.ctaLabel && input.ctaUrl
          ? { label: input.ctaLabel, url: input.ctaUrl }
          : undefined,
      bodyHtml: input.body,
      title: input.title,
    });
  }

  private escapeHtml(value: string): string {
    return escapeSystemEmailHtml(value);
  }
}
