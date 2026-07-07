import { randomBytes } from 'node:crypto';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import {
  buildLifecycleSystemEmailAction,
  getLifecycleSystemEmailDefinition,
  renderLifecycleSystemEmailParagraphs,
} from '@genfeedai/constants';
import { PostStatus, SubscriptionStatus } from '@genfeedai/enums';
import type { LifecycleEmailJobData } from '@genfeedai/queue-contracts';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { Inject, Injectable } from '@nestjs/common';
import {
  SERVER_TOKENS,
  type ServerConfig,
  type ServerLogger,
  type ServerNotifications,
  type ServerPrisma,
} from '@server/server.dependencies';

const DELIVERY_STATUS = {
  CANCELED: 'canceled',
  FAILED: 'failed',
  SENT: 'sent',
  SKIPPED: 'skipped',
} as const;

type UserEmailTarget = {
  id: string;
  email: string | null;
  firstName: string | null;
  isDeleted: boolean;
};

type LifecycleEmailMetadata = {
  checkoutUrl?: string;
  organizationId?: string;
  source?: string;
  subscriptionId?: string;
};

type LifecycleEmailDeliveryRecord = {
  id: string;
  email: string;
  sequence: string;
  step: string;
  triggerKey: string;
  status: string;
  scheduledFor: Date;
  metadata: unknown;
  user: UserEmailTarget;
};

type EmailTemplate = {
  subject: string;
  title: string;
  preheader: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
};

@Injectable()
export class LifecycleEmailDeliveryService {
  private readonly context = { service: LifecycleEmailDeliveryService.name };

  constructor(
    @Inject(SERVER_TOKENS.prisma)
    private readonly prisma: ServerPrisma,
    @Inject(SERVER_TOKENS.notifications)
    private readonly notificationsService: ServerNotifications,
    @Inject(SERVER_TOKENS.config)
    private readonly configService: ServerConfig,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
  ) {}

  async unsubscribe(token: string): Promise<boolean> {
    const normalized = token.trim();
    if (!normalized) {
      return false;
    }

    const preference = await this.prisma.lifecycleEmailPreference.findUnique({
      where: { unsubscribeToken: normalized },
    });

    if (!preference) {
      return false;
    }

    if (!preference.marketingUnsubscribedAt) {
      await this.prisma.lifecycleEmailPreference.update({
        data: { marketingUnsubscribedAt: new Date() },
        where: { id: preference.id },
      });
    }

    return true;
  }

  async sendLifecycleEmail(data: LifecycleEmailJobData): Promise<void> {
    const delivery = await this.findDelivery(data);
    if (!delivery) {
      this.logger.warn('Lifecycle email delivery record missing', {
        ...this.context,
        sequence: data.sequence,
        step: data.step,
        triggerKey: data.triggerKey,
        userId: data.userId,
      });
      return;
    }

    if (delivery.status === DELIVERY_STATUS.SENT) {
      return;
    }

    if (
      delivery.status === DELIVERY_STATUS.CANCELED ||
      delivery.status === DELIVERY_STATUS.SKIPPED
    ) {
      return;
    }

    if (IS_SELF_HOSTED) {
      await this.markDeliverySkipped(delivery.id, 'self-hosted deployment');
      return;
    }

    try {
      const user = delivery.user;
      if (user.isDeleted || !user.email) {
        await this.markDeliverySkipped(delivery.id, 'recipient unavailable');
        return;
      }

      const preference = await this.ensurePreference(user.id);
      if (preference.marketingUnsubscribedAt) {
        await this.markDeliverySkipped(delivery.id, 'marketing unsubscribed');
        return;
      }

      if (
        data.sequence === 'activation-nudge' &&
        (await this.hasActivated(user.id))
      ) {
        await this.markDeliverySkipped(delivery.id, 'already activated');
        return;
      }

      if (
        data.sequence === 'win-back' &&
        (await this.hasActiveSubscription(user.id))
      ) {
        await this.markDeliverySkipped(delivery.id, 'subscription active');
        return;
      }

      const template = this.buildTemplate({
        data,
        metadata: this.parseMetadata(delivery.metadata),
        user,
      });

      await this.notificationsService.sendEmail(
        user.email,
        template.subject,
        this.buildHtml(template, preference.unsubscribeToken),
      );

      await this.prisma.lifecycleEmailDelivery.update({
        data: {
          failureReason: null,
          sentAt: new Date(),
          status: DELIVERY_STATUS.SENT,
        },
        where: { id: delivery.id },
      });
    } catch (error: unknown) {
      await this.prisma.lifecycleEmailDelivery.update({
        data: {
          failureReason: this.errorMessage(error),
          status: DELIVERY_STATUS.FAILED,
        },
        where: { id: delivery.id },
      });
      throw error;
    }
  }

  private async ensurePreference(userId: string): Promise<{
    id: string;
    marketingUnsubscribedAt: Date | null;
    unsubscribeToken: string;
  }> {
    const existing = await this.prisma.lifecycleEmailPreference.findUnique({
      where: { userId },
    });

    if (existing) {
      return existing;
    }

    try {
      return await this.prisma.lifecycleEmailPreference.create({
        data: {
          unsubscribeToken: randomBytes(32).toString('base64url'),
          userId,
        },
      });
    } catch (error: unknown) {
      if (!this.isUniqueConstraintError(error)) {
        throw error;
      }

      const preference = await this.prisma.lifecycleEmailPreference.findUnique({
        where: { userId },
      });
      if (!preference) {
        throw error;
      }
      return preference;
    }
  }

  private async findDelivery(
    data: LifecycleEmailJobData,
  ): Promise<LifecycleEmailDeliveryRecord | null> {
    return await this.prisma.lifecycleEmailDelivery.findFirst({
      include: {
        user: {
          select: {
            email: true,
            firstName: true,
            id: true,
            isDeleted: true,
          },
        },
      },
      where: {
        sequence: data.sequence,
        step: data.step,
        triggerKey: data.triggerKey,
        userId: data.userId,
      },
    });
  }

  private async hasActivated(userId: string): Promise<boolean> {
    const publishedPost = await this.prisma.post.findFirst({
      select: { id: true },
      where: {
        isDeleted: false,
        status: PostStatus.PUBLIC,
        userId,
      },
    });

    return publishedPost !== null;
  }

  private async hasActiveSubscription(userId: string): Promise<boolean> {
    const [organizationSubscription, userSubscription] = await Promise.all([
      this.prisma.subscription.findFirst({
        select: { id: true },
        where: {
          isDeleted: false,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
          userId,
        },
      }),
      this.prisma.userSubscription.findFirst({
        select: { id: true },
        where: {
          isDeleted: false,
          status: {
            in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
          },
          userId,
        },
      }),
    ]);

    return organizationSubscription !== null || userSubscription !== null;
  }

  private async markDeliverySkipped(
    deliveryId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.lifecycleEmailDelivery.update({
      data: {
        failureReason: reason,
        skippedAt: new Date(),
        status: DELIVERY_STATUS.SKIPPED,
      },
      where: { id: deliveryId },
    });
  }

  private buildTemplate(input: {
    data: LifecycleEmailJobData;
    metadata: LifecycleEmailMetadata;
    user: UserEmailTarget;
  }): EmailTemplate {
    const firstName = input.user.firstName?.trim();
    const greeting = firstName ? `Hi ${firstName}` : 'Hi there';
    const appUrl = this.appUrl();

    const definition = getLifecycleSystemEmailDefinition(input.data.step);
    if (definition) {
      const action = buildLifecycleSystemEmailAction(
        definition,
        appUrl,
        input.metadata.checkoutUrl,
      );

      return {
        actionLabel: action.label,
        actionUrl: action.url,
        paragraphs: renderLifecycleSystemEmailParagraphs(definition, greeting),
        preheader: definition.preheader,
        subject: definition.subject,
        title: definition.title,
      };
    }

    return {
      actionLabel: 'Open Genfeed',
      actionUrl: appUrl,
      paragraphs: [
        `${greeting}, there is an update waiting in your Genfeed workspace.`,
      ],
      preheader: 'Open your Genfeed workspace.',
      subject: 'Open Genfeed',
      title: 'Open Genfeed',
    };
  }

  private buildHtml(template: EmailTemplate, unsubscribeToken: string): string {
    const unsubscribeUrl = this.unsubscribeUrl(unsubscribeToken);
    const bodyHtml = [
      ...template.paragraphs.map((paragraph) =>
        buildSystemEmailParagraph(paragraph),
      ),
      `<p style="margin:8px 0 20px;color:#8c8c96;font-size:12px;line-height:18px;">No longer want lifecycle emails? <a href="${escapeSystemEmailHtml(unsubscribeUrl)}" style="color:#b4b4bc;text-decoration:underline;">Unsubscribe</a>.</p>`,
    ].join('');

    return buildSystemEmailHtml({
      action: { label: template.actionLabel, url: template.actionUrl },
      appUrl: this.appUrl(),
      bodyHtml,
      footerNote:
        'You are receiving this account lifecycle email because you signed up for Genfeed.ai.',
      preheader: template.preheader,
      title: template.title,
    });
  }

  private appUrl(): string {
    return this.stripTrailingSlash(
      this.configService.get('GENFEEDAI_APP_URL') ?? 'https://app.genfeed.ai',
    );
  }

  private apiUrl(): string {
    return this.stripTrailingSlash(
      this.configService.get('GENFEEDAI_API_URL') ?? 'https://api.genfeed.ai',
    );
  }

  private unsubscribeUrl(token: string): string {
    return `${this.apiUrl()}/lifecycle-emails/unsubscribe?token=${encodeURIComponent(token)}`;
  }

  private stripTrailingSlash(value: string): string {
    return value.replace(/\/+$/, '');
  }

  private parseMetadata(value: unknown): LifecycleEmailMetadata {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return {};
    }

    const record = value as Record<string, unknown>;

    return {
      checkoutUrl:
        typeof record.checkoutUrl === 'string' ? record.checkoutUrl : undefined,
      organizationId:
        typeof record.organizationId === 'string'
          ? record.organizationId
          : undefined,
      source: typeof record.source === 'string' ? record.source : undefined,
      subscriptionId:
        typeof record.subscriptionId === 'string'
          ? record.subscriptionId
          : undefined,
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'P2002'
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
