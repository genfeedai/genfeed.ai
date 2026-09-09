import { randomBytes } from 'node:crypto';
import {
  SERVER_TOKENS,
  type ServerConfig,
  type ServerLogger,
} from '@api/server.dependencies';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isSelfHostedDeployment } from '@genfeedai/config';
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
import { SystemEmailEligibilityService } from './system-email-eligibility.service';

const DELIVERY_STATUS = {
  CANCELED: 'canceled',
  FAILED: 'failed',
  QUEUED: 'queued',
  SENT: 'sent',
  SKIPPED: 'skipped',
} as const;

// Every status a delivery can never leave once reached. A finalize replay
// (BullMQ retry against a terminal job) must not overwrite the row that
// already recorded why the delivery stopped.
const TERMINAL_DELIVERY_STATUSES = new Set<string>([
  DELIVERY_STATUS.SENT,
  DELIVERY_STATUS.QUEUED,
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
  emailMessageId?: string;
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
    private readonly prisma: PrismaService,
    private readonly emailPerformance: EmailPerformanceService,
    @Inject(SERVER_TOKENS.config)
    private readonly configService: ServerConfig,
    @Inject(SERVER_TOKENS.logger)
    private readonly logger: ServerLogger,
    private readonly eligibility: SystemEmailEligibilityService,
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
    if (
      delivery.status === DELIVERY_STATUS.SENT ||
      delivery.status === DELIVERY_STATUS.QUEUED
    ) {
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
    const organizationId =
      this.parseMetadata(delivery.metadata).organizationId ??
      state.request.organizationId;
    if (
      !organizationId ||
      !(await this.eligibility.shouldSend({
        organizationId,
        userId: delivery.user.id,
        templateKey: state.request.step,
        policyData: { lifecycleDeliveryId: delivery.id },
      }))
    ) {
      return {
        ...state,
        preference,
        skipReason: 'lifecycle milestone fulfilled or tenant unavailable',
      };
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
    const organizationId =
      this.parseMetadata(state.delivery.metadata).organizationId ??
      state.request.organizationId;
    if (!organizationId)
      throw new Error('Lifecycle delivery organization missing');
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, isDeleted: false },
      select: { slug: true },
    });
    const destinationUrl =
      state.request.step === 'checkout-recovery' && organization
        ? `${this.appUrl()}/${organization.slug}/~/settings/credits`
        : state.template.actionUrl;
    const emailMessageId = await this.emailPerformance.queueEmail({
      userId: state.delivery.user.id,
      organizationId,
      topic: 'lifecycle.onboarding',
      templateKey: state.request.step,
      subject: state.template.subject,
      html: state.html,
      destinationUrl,
      goal:
        state.request.step === 'checkout-recovery' ||
        state.request.step === 'win-back'
          ? 'buy_credits'
          : state.request.step === 'welcome-day-2'
            ? 'connect_account'
            : state.request.step === 'welcome-day-0' ||
                state.request.step === 'setup-reminder'
              ? 'generate_content'
              : state.request.step === 'first-generation'
                ? 'generate_content'
                : 'publish_content',
      idempotencyKey: `lifecycle:${state.delivery.id}`,
      lifecycleDeliveryId: state.delivery.id,
      policyData: { lifecycleDeliveryId: state.delivery.id },
    });
    return { ...state, emailMessageId };
  }

  async finalizeLifecycleDelivery(
    state: LifecycleEmailDeliveryState | undefined,
    error?: string,
  ): Promise<{ delivered: boolean; queued?: boolean; skipped?: string }> {
    if (!state?.delivery) {
      return {
        delivered: false,
        ...(state?.skipReason ? { skipped: state.skipReason } : {}),
      };
    }
    if (error) {
      await this.prisma.lifecycleEmailDelivery.updateMany({
        data: { failureReason: error, status: DELIVERY_STATUS.FAILED },
        where: {
          id: state.delivery.id,
          status: { in: ['scheduled', 'failed'] },
        },
      });
      return { delivered: false };
    }
    if (state.skipReason) {
      if (!TERMINAL_DELIVERY_STATUSES.has(state.delivery.status)) {
        await this.markDeliverySkipped(state.delivery.id, state.skipReason);
      }
      return { delivered: false, skipped: state.skipReason };
    }
    await this.prisma.lifecycleEmailDelivery.updateMany({
      data: { failureReason: null, status: DELIVERY_STATUS.QUEUED },
      where: { id: state.delivery.id, status: { in: ['scheduled', 'failed'] } },
    });
    return { delivered: false, queued: true };
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
        undefined,
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
    }).replaceAll(
      `href="${escapeSystemEmailHtml(template.actionUrl)}"`,
      'href="{{emailActionUrl}}"',
    );
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
