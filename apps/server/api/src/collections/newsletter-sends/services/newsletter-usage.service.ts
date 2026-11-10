import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { hasOrganizationBilling } from '@genfeedai/config';
import {
  NEWSLETTER_PLAN_LIMITS,
  type NewsletterPlanKey,
} from '@genfeedai/contracts/constants';
import type { INewsletterUsage } from '@genfeedai/contracts/interfaces';
import { Traced } from '@libs/tracing/traced';
import { ForbiddenException, Injectable } from '@nestjs/common';

// Only confirmed readers count toward the plan cap, so unconfirmed public
// sign-ups can never fill a list and lock its owner out.
const COUNTED_SUBSCRIBER_STATUSES = ['active'];

/**
 * Plan caps on subscribers and monthly sends. A Cloud runtime gate: only a
 * deployment that bills organizations applies them; self-hosted is unlimited.
 */
@Traced()
@Injectable()
export class NewsletterUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paidAccess: OrganizationPaidAccessService,
  ) {}

  async getUsage(organizationId: string): Promise<INewsletterUsage> {
    const plan = await this.resolvePlan(organizationId);
    const [subscribers, emailsThisMonth] = await Promise.all([
      this.countSubscribers(organizationId),
      this.countEmailsThisMonth(organizationId),
    ]);
    const limits = plan === 'unlimited' ? null : NEWSLETTER_PLAN_LIMITS[plan];
    return {
      emailLimit: limits?.emailsPerMonth ?? null,
      emailsThisMonth,
      plan,
      subscriberLimit: limits?.subscribers ?? null,
      subscribers,
    };
  }

  /** Whether the "Sent with Genfeed" footer link may be turned off. */
  async canRemoveAttribution(organizationId: string): Promise<boolean> {
    return (await this.resolvePlan(organizationId)) !== 'free';
  }

  /** Whether `incoming` more subscribers fit the plan cap. */
  async hasSubscriberCapacity(
    organizationId: string,
    incoming: number,
  ): Promise<boolean> {
    if (incoming <= 0) return true;
    const usage = await this.getUsage(organizationId);
    return (
      usage.subscriberLimit === null ||
      usage.subscribers + incoming <= usage.subscriberLimit
    );
  }

  /** Refuse adding `incoming` subscribers past the plan cap. */
  async assertSubscriberCapacity(
    organizationId: string,
    incoming: number,
  ): Promise<void> {
    if (await this.hasSubscriberCapacity(organizationId, incoming)) return;
    const usage = await this.getUsage(organizationId);
    throw new ForbiddenException({
      code: 'NEWSLETTER_SUBSCRIBER_LIMIT',
      message: `Your plan allows ${usage.subscriberLimit} subscribers. Upgrade to add more.`,
    });
  }

  /**
   * Emails this month's cap still allows once sent emails and emails already
   * queued in other sends count, or null on a plan without a cap. The worker
   * checks it again when a send starts, so subscribers added after
   * scheduling cannot push a send past the cap.
   */
  async remainingEmails(organizationId: string): Promise<number | null> {
    const plan = await this.resolvePlan(organizationId);
    if (plan === 'unlimited') return null;
    const [sent, queued] = await Promise.all([
      this.countEmailsThisMonth(organizationId),
      this.countQueuedEmails(organizationId),
    ]);
    return Math.max(
      0,
      NEWSLETTER_PLAN_LIMITS[plan].emailsPerMonth - sent - queued,
    );
  }

  /** Refuse a send that would exceed this month's email cap before it starts. */
  async assertSendCapacity(
    organizationId: string,
    recipients: number,
  ): Promise<void> {
    const remaining = await this.remainingEmails(organizationId);
    if (remaining !== null && recipients > remaining) {
      throw new ForbiddenException({
        code: 'NEWSLETTER_SEND_LIMIT',
        message: `This send needs ${recipients} emails and your plan has ${remaining} left this month.`,
      });
    }
  }

  private async resolvePlan(
    organizationId: string,
  ): Promise<NewsletterPlanKey | 'unlimited'> {
    if (!hasOrganizationBilling()) return 'unlimited';
    return (await this.paidAccess.isSubscriptionGated(organizationId))
      ? 'free'
      : 'paid';
  }

  private countSubscribers(organizationId: string): Promise<number> {
    return this.prisma.brandSubscriber.count({
      where: scopedWhere(organizationId, {
        status: { in: COUNTED_SUBSCRIBER_STATUSES },
      }),
    });
  }

  /** Recipients of sends already under way that have not been emailed yet. */
  private countQueuedEmails(organizationId: string): Promise<number> {
    return this.prisma.newsletterSendRecipient.count({
      where: scopedWhere(organizationId, { status: 'pending' }),
    });
  }

  private countEmailsThisMonth(organizationId: string): Promise<number> {
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    return this.prisma.newsletterSendRecipient.count({
      where: scopedWhere(organizationId, {
        sentAt: { gte: monthStart },
        status: 'sent',
      }),
    });
  }
}
