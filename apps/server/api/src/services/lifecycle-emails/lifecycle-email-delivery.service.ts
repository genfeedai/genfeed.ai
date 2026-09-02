import { randomBytes } from 'node:crypto';
import {
  SERVER_TOKENS,
  type ServerConfig,
  type ServerLogger,
  type ServerNotifications,
  type ServerPrisma,
} from '@api/server.dependencies';
import { isSelfHostedDeployment } from '@genfeedai/config';
import { SubscriptionStatus, TargetExecutionState } from '@genfeedai/contracts';
import { postExecutionStateReadFilter } from '@genfeedai/contracts/api-types';
import {
  buildLifecycleSystemEmailAction,
  getLifecycleSystemEmailDefinition,
  renderLifecycleSystemEmailParagraphs,
} from '@genfeedai/contracts/constants';
import type { LifecycleEmailWorkflowInput } from '@genfeedai/contracts/interfaces';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
  sanitizeSystemEmailUrl,
} from '@helpers/email/system-email.helper';
import { Inject, Injectable } from '@nestjs/common';

const DELIVERY_STATUS = {
  CANCELED: 'canceled',
  FAILED: 'failed',
  SENT: 'sent',
  SKIPPED: 'skipped',
} as const;

// Every status a delivery can never leave once reached. A finalize replay
// (BullMQ retry against a terminal job) must not overwrite the row that
// already recorded why the delivery stopped.
const TERMINAL_DELIVERY_STATUSES = new Set<string>([
  DELIVERY_STATUS.SENT,
  DELIVERY_STATUS.CANCELED,
  DELIVERY_STATUS.SKIPPED,
]);

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
  scheduledFor: string;
  metadata: unknown;
  user: UserEmailTarget;
};

type StoredLifecycleEmailDeliveryRecord = Omit<
  LifecycleEmailDeliveryRecord,
  'scheduledFor'
> & {
  scheduledFor: Date;
};

type EmailTemplate = {
  subject: string;
  title: string;
  preheader: string;
  paragraphs: string[];
  actionLabel: string;
  actionUrl: string;
};

export type LifecycleEmailDeliveryState = {
  delivery?: LifecycleEmailDeliveryRecord;
  html?: string;
  preference?: {
    id: string;
    marketingUnsubscribedAt: string | null;
    unsubscribeToken: string;
  };
  request: LifecycleEmailWorkflowInput;
  skipReason?: string;
  template?: EmailTemplate;
};

@Injectable()
export class LifecycleEmailDeliveryService {
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

  async loadLifecycleDelivery(
    request: LifecycleEmailWorkflowInput,
  ): Promise<LifecycleEmailDeliveryState> {
    const delivery = await this.findDelivery(request);
    return {
      ...(delivery
        ? {
            delivery: {
              ...delivery,
              scheduledFor: delivery.scheduledFor.toISOString(),
            },
          }
        : {}),
      request,
    };
  }

  async checkLifecycleEligibility(
    state: LifecycleEmailDeliveryState,
  ): Promise<LifecycleEmailDeliveryState> {
    const delivery = state.delivery;
    if (!delivery) return { ...state, skipReason: 'delivery record missing' };
    if (delivery.status === DELIVERY_STATUS.SENT) {
      return { ...state, skipReason: 'already sent' };
    }
    if (
      delivery.status === DELIVERY_STATUS.CANCELED ||
      delivery.status === DELIVERY_STATUS.SKIPPED
    ) {
      return { ...state, skipReason: delivery.status };
    }
    if (isSelfHostedDeployment()) {
      return { ...state, skipReason: 'self-hosted deployment' };
    }
    if (delivery.user.isDeleted || !delivery.user.email) {
      return { ...state, skipReason: 'recipient unavailable' };
    }
    const storedPreference = await this.ensurePreference(delivery.user.id);
    const preference = {
      ...storedPreference,
      marketingUnsubscribedAt:
        storedPreference.marketingUnsubscribedAt?.toISOString() ?? null,
    };
    if (preference.marketingUnsubscribedAt) {
      return { ...state, preference, skipReason: 'marketing unsubscribed' };
    }
    if (
      state.request.sequence === 'activation-nudge' &&
      (await this.hasActivated(delivery.user.id))
    ) {
      return { ...state, preference, skipReason: 'already activated' };
    }
    if (
      state.request.sequence === 'win-back' &&
      (await this.hasActiveSubscription(delivery.user.id))
    ) {
      return { ...state, preference, skipReason: 'subscription active' };
    }
    return { ...state, preference };
  }

  renderLifecycleDelivery(
    state: LifecycleEmailDeliveryState,
  ): LifecycleEmailDeliveryState {
    if (state.skipReason || !state.delivery || !state.preference) return state;
    const template = this.buildTemplate({
      data: state.request,
      metadata: this.parseMetadata(state.delivery.metadata),
      user: state.delivery.user,
    });
    return {
      ...state,
      html: this.buildHtml(template, state.preference.unsubscribeToken),
      template,
    };
  }

  async deliverLifecycleEmail(
    state: LifecycleEmailDeliveryState,
  ): Promise<LifecycleEmailDeliveryState> {
    if (
      state.skipReason ||
      !state.delivery?.user.email ||
      !state.template ||
      !state.html
    ) {
      return state;
    }
    await this.notificationsService.sendEmail(
      state.delivery.user.email,
      state.template.subject,
      state.html,
    );
    return state;
  }

  async finalizeLifecycleDelivery(
    state: LifecycleEmailDeliveryState | undefined,
    error?: string,
  ): Promise<{ delivered: boolean; skipped?: string }> {
    if (!state?.delivery) {
      return {
        delivered: false,
        ...(state?.skipReason ? { skipped: state.skipReason } : {}),
      };
    }
    if (error) {
      await this.prisma.lifecycleEmailDelivery.update({
        data: { failureReason: error, status: DELIVERY_STATUS.FAILED },
        where: { id: state.delivery.id },
      });
      return { delivered: false };
    }
    if (state.skipReason) {
      if (!TERMINAL_DELIVERY_STATUSES.has(state.delivery.status)) {
        await this.markDeliverySkipped(state.delivery.id, state.skipReason);
      }
      return { delivered: false, skipped: state.skipReason };
    }
    await this.prisma.lifecycleEmailDelivery.update({
      data: {
        failureReason: null,
        sentAt: new Date(),
        status: DELIVERY_STATUS.SENT,
      },
      where: { id: state.delivery.id },
    });
    return { delivered: true };
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
    data: LifecycleEmailWorkflowInput,
  ): Promise<StoredLifecycleEmailDeliveryRecord | null> {
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
    // tenant-scope-ignore: activation is a per-person lifecycle signal, not a per-tenant one; a user can belong to several organizations and this asks whether they have ever published anywhere, so scoping it to one organization would under-report and re-send activation email
    const publishedPost = await this.prisma.post.findFirst({
      select: { id: true },
      where: {
        isDeleted: false,
        ...postExecutionStateReadFilter(TargetExecutionState.PUBLISHED),
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
    data: LifecycleEmailWorkflowInput;
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
    // A misconfigured API url must never turn the unsubscribe anchor into an
    // arbitrary scheme; keep the notice either way, drop only the link.
    const unsubscribeUrl = sanitizeSystemEmailUrl(
      this.unsubscribeUrl(unsubscribeToken),
    );
    const unsubscribeHtml = unsubscribeUrl
      ? `No longer want lifecycle emails? <a href="${escapeSystemEmailHtml(unsubscribeUrl)}" style="color:#A1A1A1;text-decoration:underline;">Unsubscribe</a>.`
      : 'No longer want lifecycle emails? Reply to this email to unsubscribe.';
    const bodyHtml = [
      ...template.paragraphs.map((paragraph) =>
        buildSystemEmailParagraph(paragraph),
      ),
      `<p style="margin:8px 0 20px;color:#949494;font-size:12px;line-height:18px;">${unsubscribeHtml}</p>`,
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
}
