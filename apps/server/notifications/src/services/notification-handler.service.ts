import process from 'node:process';
import { IngredientCategory } from '@genfeedai/enums';
import type { NotificationEvent } from '@libs/interfaces/events.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscordService } from '@notifications/services/discord/discord.service';
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
    await this.redisService.subscribe(
      'notifications',
      (event: NotificationEvent) => {
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
      },
    );

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
      case 'ingredient_notification':
        await this.discordService.sendIngredientNotification(
          payload.category || IngredientCategory.IMAGE,
          payload.cdnUrl,
          payload.ingredient,
        );
        break;

      case 'post_notification':
        await this.discordService.sendPostCard(payload);
        break;

      case 'article_notification':
        await this.discordService.sendArticleNotification(payload);
        break;

      case 'vercel_notification':
        await this.discordService.sendVercelNotification(payload.embed);
        break;

      case 'chromatic_notification':
        await this.discordService.sendChromaticNotification(payload.embed);
        break;

      case 'user_notification':
        await this.discordService.sendUserCreatedNotification(payload);
        break;

      case 'model_discovery':
        await this.discordService.sendModelDiscoveryNotification(
          payload as {
            modelKey: string;
            category: string;
            estimatedCost: number;
            providerCostUsd: number;
            provider: string;
            qualityTier?: string;
            speedTier?: string;
          },
        );
        break;

      case 'low_credits_alert':
        await this.discordService.sendLowCreditsAlert(
          payload as { organizationId: string; balance: number },
        );
        break;

      case 'streak_at_risk':
      case 'streak_broken':
      case 'streak_freeze_used':
      case 'streak_milestone': {
        const cardPayload = payload as {
          card?: {
            color?: number;
            description?: string;
            title?: string;
          };
        };
        await this.discordService.sendStreakNotification({
          color:
            typeof cardPayload.card?.color === 'number'
              ? cardPayload.card.color
              : 0xf97316,
          description: String(cardPayload.card?.description || ''),
          title: String(cardPayload.card?.title || 'GenFeed streak'),
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
      case 'ingredient_notification':
        if (payload.chatId && payload.cdnUrl) {
          const caption = payload.ingredient?.name
            ? `*${payload.ingredient.name}*\nGenerated with GenFeed AI`
            : 'Generated with GenFeed AI';
          await this.telegramService.sendPhoto(
            payload.chatId,
            payload.cdnUrl,
            caption,
          );
        }
        break;

      case 'post_notification':
        if (payload.chatId) {
          const text = payload.title
            ? `*New Post:* ${payload.title}\n${payload.description || ''}`
            : 'New post published';
          await this.telegramService.sendMessage(payload.chatId, text);
        }
        break;

      case 'send_message':
        if (payload.chatId && payload.text) {
          await this.telegramService.sendMessage(payload.chatId, payload.text);
        }
        break;

      default:
        this.logger.warn(`Unknown Telegram action: ${action}`, this.context);
    }
  }

  private async handleEmailAction(event: NotificationEvent): Promise<void> {
    const { action, payload } = event;

    switch (action) {
      case 'send_email':
        await this.resendService.sendEmail({
          from: typeof payload.from === 'string' ? payload.from : undefined,
          html: String(payload.html || payload.content || payload.text || ''),
          replyTo:
            typeof payload.replyTo === 'string' ? payload.replyTo : undefined,
          subject: String(payload.subject || 'Genfeed notification'),
          text: typeof payload.text === 'string' ? payload.text : undefined,
          to: String(payload.to || ''),
        });
        break;

      case 'crm_lead_outreach':
        await this.sendCrmLeadOutreachEmail(payload);
        break;

      case 'video_status_email':
        await this.sendVideoStatusEmail(payload);
        break;

      case 'workflow_status_email':
        await this.sendWorkflowStatusEmail(payload);
        break;

      case 'low_credits_alert':
        if (payload.to) {
          const subject = 'Your Genfeed credits are running low';
          const html = this.wrapEmailTemplate({
            body: `<p>Your Genfeed account has ${payload.balance} credits remaining.</p><p>Top up to continue generating content without interruption.</p>`,
            ctaLabel: 'Top Up Now',
            ctaUrl: `${process.env.GENFEEDAI_APP_URL || 'https://app.genfeed.ai'}/settings/billing`,
            title: subject,
          });

          await this.resendService.sendEmail({
            html,
            subject,
            text: `Your Genfeed account has ${payload.balance} credits remaining. Top up to continue generating content without interruption.`,
            to: String(payload.to),
          });
        } else {
          this.logger.warn(
            'low_credits_alert email skipped - no recipient address in payload',
            this.context,
          );
        }
        break;

      default:
        this.logger.warn(`Unknown Email action: ${action}`, this.context);
    }
  }

  private async handleSlackAction(event: NotificationEvent): Promise<void> {
    const { action, payload } = event;

    switch (action) {
      case 'ingredient_notification':
        if (payload.channelId && payload.cdnUrl) {
          const comment = payload.ingredient?.name
            ? `*${payload.ingredient.name}*\nGenerated with GenFeed AI`
            : 'Generated with GenFeed AI';
          await this.slackService.sendFile(
            payload.channelId,
            payload.cdnUrl,
            comment,
          );
        }
        break;

      case 'post_notification':
        if (payload.channelId) {
          const text = payload.title
            ? `*New Post:* ${payload.title}\n${payload.description || ''}`
            : 'New post published';
          await this.slackService.sendMessage(payload.channelId, text);
        }
        break;

      case 'send_message':
        if (payload.channelId && payload.text) {
          await this.slackService.sendMessage(payload.channelId, payload.text);
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
    payload: Record<string, unknown>,
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
    payload: Record<string, unknown>,
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
    payload: Record<string, unknown>,
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

  private wrapEmailTemplate(input: {
    title: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
  }): string {
    const cta =
      input.ctaLabel && input.ctaUrl
        ? `<p style="margin-top:24px;"><a href="${this.escapeHtml(input.ctaUrl)}" style="background:#111827;border-radius:8px;color:#ffffff;display:inline-block;padding:12px 16px;text-decoration:none;">${this.escapeHtml(input.ctaLabel)}</a></p>`
        : '';

    return `<!DOCTYPE html><html><body style="background:#f8fafc;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;margin:0;padding:24px;"><div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;max-width:640px;margin:0 auto;padding:32px;"><h1 style="font-size:24px;line-height:1.2;margin:0 0 16px;">${this.escapeHtml(input.title)}</h1>${input.body}${cta}</div></body></html>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
