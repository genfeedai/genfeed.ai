import { randomBytes } from 'node:crypto';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { IS_SELF_HOSTED } from '@genfeedai/config';
import { PostStatus, SubscriptionStatus } from '@genfeedai/enums';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
} from '@genfeedai/helpers';
import type { Prisma } from '@genfeedai/prisma';
import type {
  LifecycleEmailJobData,
  LifecycleEmailSequence,
  LifecycleEmailStep,
} from '@genfeedai/queue-contracts';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

import { LifecycleEmailQueueService } from './lifecycle-email-queue.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const WELCOME_TRIGGER_PREFIX = 'signup';
const CHECKOUT_TRIGGER_PREFIX = 'checkout';
const SUBSCRIPTION_TRIGGER_PREFIX = 'subscription';

const DELIVERY_STATUS = {
  CANCELED: 'canceled',
  FAILED: 'failed',
  SCHEDULED: 'scheduled',
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

type ScheduleDeliveryInput = {
  user: UserEmailTarget;
  sequence: LifecycleEmailSequence;
  step: LifecycleEmailStep;
  triggerKey: string;
  scheduledFor: Date;
  metadata?: LifecycleEmailMetadata;
};

type CheckoutStartedInput = {
  userId: string;
  checkoutSessionId: string;
  checkoutUrl?: string | null;
  organizationId?: string;
  source?: string;
};

type ManagedCheckoutStartedInput = {
  email: string;
  checkoutSessionId: string;
  checkoutUrl?: string | null;
};

type SubscriptionLapsedInput = {
  userId: string;
  organizationId: string;
  subscriptionId: string;
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
export class LifecycleEmailService {
  private readonly context = { service: LifecycleEmailService.name };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly queueService: LifecycleEmailQueueService,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async scheduleSignupLifecycle(userId: string): Promise<void> {
    await this.runSchedulingOperation('scheduleSignupLifecycle', async () => {
      const user = await this.findEmailTargetById(userId);
      if (!user?.email) {
        return;
      }

      const now = new Date();
      const triggerKey = `${WELCOME_TRIGGER_PREFIX}:${user.id}`;

      await this.scheduleDelivery({
        scheduledFor: now,
        sequence: 'welcome',
        step: 'welcome-day-0',
        triggerKey,
        user,
      });
      await this.scheduleDelivery({
        scheduledFor: new Date(now.getTime() + 2 * DAY_MS),
        sequence: 'welcome',
        step: 'welcome-day-2',
        triggerKey,
        user,
      });
      await this.scheduleDelivery({
        scheduledFor: new Date(now.getTime() + 7 * DAY_MS),
        sequence: 'welcome',
        step: 'welcome-day-7',
        triggerKey,
        user,
      });
      await this.scheduleDelivery({
        scheduledFor: new Date(now.getTime() + 3 * DAY_MS),
        sequence: 'activation-nudge',
        step: 'activation-nudge',
        triggerKey,
        user,
      });
    });
  }

  async recordCheckoutStarted(input: CheckoutStartedInput): Promise<void> {
    await this.runSchedulingOperation('recordCheckoutStarted', async () => {
      const user = await this.findEmailTargetById(input.userId);
      if (!user?.email) {
        return;
      }

      await this.scheduleDelivery({
        metadata: {
          checkoutUrl: input.checkoutUrl ?? undefined,
          organizationId: input.organizationId,
          source: input.source,
        },
        scheduledFor: new Date(Date.now() + DAY_MS),
        sequence: 'abandoned-checkout',
        step: 'checkout-recovery',
        triggerKey: this.checkoutTriggerKey(input.checkoutSessionId),
        user,
      });
    });
  }

  async recordManagedCheckoutStartedByEmail(
    input: ManagedCheckoutStartedInput,
  ): Promise<void> {
    await this.runSchedulingOperation(
      'recordManagedCheckoutStartedByEmail',
      async () => {
        const user = await this.findEmailTargetByEmail(input.email);
        if (!user?.email) {
          return;
        }

        await this.recordCheckoutStarted({
          checkoutSessionId: input.checkoutSessionId,
          checkoutUrl: input.checkoutUrl,
          source: 'managed-checkout',
          userId: user.id,
        });
      },
    );
  }

  async recordCheckoutCompleted(checkoutSessionId: string): Promise<void> {
    await this.runSchedulingOperation('recordCheckoutCompleted', async () => {
      await this.prisma.lifecycleEmailDelivery.updateMany({
        data: {
          canceledAt: new Date(),
          status: DELIVERY_STATUS.CANCELED,
        },
        where: {
          sequence: 'abandoned-checkout',
          status: {
            in: [DELIVERY_STATUS.SCHEDULED, DELIVERY_STATUS.FAILED],
          },
          triggerKey: this.checkoutTriggerKey(checkoutSessionId),
        },
      });
    });
  }

  async recordSubscriptionLapsed(
    input: SubscriptionLapsedInput,
  ): Promise<void> {
    await this.runSchedulingOperation('recordSubscriptionLapsed', async () => {
      const user = await this.findEmailTargetById(input.userId);
      if (!user?.email) {
        return;
      }

      await this.scheduleDelivery({
        metadata: {
          organizationId: input.organizationId,
          subscriptionId: input.subscriptionId,
        },
        scheduledFor: new Date(Date.now() + 7 * DAY_MS),
        sequence: 'win-back',
        step: 'win-back',
        triggerKey: `${SUBSCRIPTION_TRIGGER_PREFIX}:${input.subscriptionId}`,
        user,
      });
    });
  }

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

  private async runSchedulingOperation(
    operation: string,
    fn: () => Promise<void>,
  ): Promise<void> {
    if (IS_SELF_HOSTED) {
      return;
    }

    try {
      await fn();
    } catch (error: unknown) {
      this.logger.warn('Lifecycle email scheduling skipped', {
        ...this.context,
        error: this.errorMessage(error),
        operation,
      });
    }
  }

  private async scheduleDelivery(input: ScheduleDeliveryInput): Promise<void> {
    const metadata = this.toJsonObject(input.metadata);

    try {
      await this.prisma.lifecycleEmailDelivery.create({
        data: {
          email: input.user.email ?? '',
          metadata,
          scheduledFor: input.scheduledFor,
          sequence: input.sequence,
          status: DELIVERY_STATUS.SCHEDULED,
          step: input.step,
          triggerKey: input.triggerKey,
          userId: input.user.id,
        },
      });
    } catch (error: unknown) {
      if (this.isUniqueConstraintError(error)) {
        return;
      }
      throw error;
    }

    await this.ensurePreference(input.user.id);
    await this.queueService.scheduleEmail(
      {
        checkoutSessionId:
          input.sequence === 'abandoned-checkout'
            ? input.triggerKey.replace(`${CHECKOUT_TRIGGER_PREFIX}:`, '')
            : undefined,
        organizationId: input.metadata?.organizationId,
        sequence: input.sequence,
        step: input.step,
        subscriptionId: input.metadata?.subscriptionId,
        triggerKey: input.triggerKey,
        userId: input.user.id,
      },
      input.scheduledFor,
    );
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

  private async findEmailTargetById(
    userId: string,
  ): Promise<UserEmailTarget | null> {
    return await this.prisma.user.findFirst({
      select: {
        email: true,
        firstName: true,
        id: true,
        isDeleted: true,
      },
      where: {
        id: userId,
        isDeleted: false,
      },
    });
  }

  private async findEmailTargetByEmail(
    email: string,
  ): Promise<UserEmailTarget | null> {
    return await this.prisma.user.findFirst({
      select: {
        email: true,
        firstName: true,
        id: true,
        isDeleted: true,
      },
      where: {
        email,
        isDeleted: false,
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
    const actionUrl =
      input.data.sequence === 'abandoned-checkout' && input.metadata.checkoutUrl
        ? input.metadata.checkoutUrl
        : this.defaultActionUrl(input.data.sequence);

    switch (input.data.step) {
      case 'welcome-day-0':
        return {
          actionLabel: 'Start onboarding',
          actionUrl: `${appUrl}/onboarding`,
          paragraphs: [
            `${greeting}, welcome to Genfeed.ai.`,
            'The fastest path is simple: set up your brand, connect one channel, and publish one useful piece of content.',
            'Your workspace is ready when you are.',
          ],
          preheader: 'Start your Genfeed.ai onboarding path.',
          subject: 'Welcome to Genfeed.ai',
          title: 'Your Genfeed workspace is ready',
        };
      case 'welcome-day-2':
        return {
          actionLabel: 'Continue setup',
          actionUrl: `${appUrl}/onboarding/providers`,
          paragraphs: [
            `${greeting}, a connected channel turns Genfeed from a workspace into a publishing loop.`,
            'Connect one destination and Genfeed can help you draft, review, and publish from the same place.',
          ],
          preheader: 'Connect one channel to keep setup moving.',
          subject: 'Connect your first Genfeed channel',
          title: 'Keep your setup moving',
        };
      case 'welcome-day-7':
        return {
          actionLabel: 'Open Genfeed',
          actionUrl: appUrl,
          paragraphs: [
            `${greeting}, your first week is about finding the repeatable content motion that fits your brand.`,
            'Open your workspace when you are ready to turn an idea into a scheduled post.',
          ],
          preheader: 'Turn one idea into a scheduled post.',
          subject: 'Ready to build your first content loop?',
          title: 'Build your first content loop',
        };
      case 'activation-nudge':
        return {
          actionLabel: 'Publish first post',
          actionUrl: `${appUrl}/onboarding`,
          paragraphs: [
            `${greeting}, your account is set up but has not reached the first publish milestone yet.`,
            'Pick one idea, let Genfeed shape the draft, and publish it to complete activation.',
          ],
          preheader: 'Publish once to complete activation.',
          subject: 'Publish your first Genfeed post',
          title: 'One publish completes activation',
        };
      case 'checkout-recovery':
        return {
          actionLabel: input.metadata.checkoutUrl
            ? 'Return to checkout'
            : 'Open Genfeed',
          actionUrl,
          paragraphs: [
            `${greeting}, your checkout did not complete.`,
            'You can return when you are ready and continue from the same Genfeed account.',
          ],
          preheader: 'Return to your Genfeed checkout when ready.',
          subject: 'Finish setting up Genfeed',
          title: 'Your checkout is still waiting',
        };
      case 'win-back':
        return {
          actionLabel: 'Open billing',
          actionUrl: `${appUrl}/settings/billing`,
          paragraphs: [
            `${greeting}, your Genfeed subscription has lapsed.`,
            'Your workspace remains focused on helping you keep a consistent content system. You can restart when the timing is right.',
          ],
          preheader: 'Restart your Genfeed workspace when ready.',
          subject: 'Restart your Genfeed content system',
          title: 'Your workspace is ready when you return',
        };
      default:
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

  private defaultActionUrl(sequence: LifecycleEmailSequence): string {
    const appUrl = this.appUrl();

    if (sequence === 'win-back') {
      return `${appUrl}/settings/billing`;
    }

    if (sequence === 'activation-nudge') {
      return `${appUrl}/onboarding`;
    }

    return appUrl;
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

  private checkoutTriggerKey(checkoutSessionId: string): string {
    return `${CHECKOUT_TRIGGER_PREFIX}:${checkoutSessionId}`;
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

  private toJsonObject(
    value: LifecycleEmailMetadata | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (!value) {
      return undefined;
    }

    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => {
        const [, entryValue] = entry;
        return typeof entryValue === 'string' && entryValue.length > 0;
      }),
    );
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
