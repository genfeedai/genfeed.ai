import { readFreeTrialState } from '@api/collections/credits/services/free-trial-state.util';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  APP_ROUTES,
  FREE_TRIAL_EMAILS,
  FREE_TRIAL_ENDING_NOTICE_MS,
  FREE_TRIAL_NOTICE_GRACE_MS,
  resolveFreeTrialRolloutAt,
} from '@genfeedai/contracts/constants';
import type {
  FreeTrialEmailTemplateKey,
  IFreeTrialState,
} from '@genfeedai/contracts/interfaces/billing';
import { BillingAccountMemberRole } from '@genfeedai/prisma';
import {
  buildSystemEmailHtml,
  buildSystemEmailParagraph,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { ConfigService } from '@libs/config/config.service';
import { Injectable } from '@nestjs/common';

/**
 * Trial notices go through the product-email path: the "billing.credits" or
 * "lifecycle.onboarding" preference (the latter also honours the marketing
 * unsubscribe), bounce suppression, and a send-time eligibility re-check
 * (`SystemEmailEligibilityService`). Each notice is idempotent per
 * organization: the ledger-style key below can only ever queue one.
 */
const TRIAL_EMAIL_TOPICS: Record<FreeTrialEmailTemplateKey, string> = {
  'trial-credits-low': 'billing.credits',
  'trial-ended': 'lifecycle.onboarding',
  'trial-ending': 'lifecycle.onboarding',
};

@Injectable()
export class FreeTrialEmailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly emails: EmailPerformanceService,
  ) {}

  /**
   * "Ends in 24 hours" from 48h, "has ended" from 72h. Each notice is only
   * sent within a day of the moment it describes, so an organization whose
   * window closed long ago never gets a late or stale notice.
   */
  async sendDueTrialNotices(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<FreeTrialEmailTemplateKey | null> {
    const notice = this.dueNotice(
      await this.readTrial(organizationId, now),
      now,
    );
    if (!notice) {
      return null;
    }
    return (await this.queue(organizationId, notice)) ? notice : null;
  }

  /**
   * "You're running low on credits" for a never-paid organization inside its
   * trial, once. The caller decides the balance is below the price of a
   * default image.
   */
  async sendTrialCreditsLow(
    organizationId: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    const state = await this.readTrial(organizationId, now);
    if (!state.trialEndsAt || state.isTrialExpired) {
      return false;
    }
    return this.queue(organizationId, 'trial-credits-low');
  }

  /**
   * Same rollout floor as admission: an organization that predates the trial
   * gets its window, and so its "ends soon" and "has ended" notices, from the
   * rollout.
   */
  private readTrial(organizationId: string, now: Date) {
    return readFreeTrialState(
      this.prisma,
      organizationId,
      now,
      resolveFreeTrialRolloutAt(this.config.get('FREE_TRIAL_ROLLOUT_AT')),
    );
  }

  private dueNotice(
    state: IFreeTrialState,
    now: Date,
  ): FreeTrialEmailTemplateKey | null {
    if (!state.trialEndsAt) {
      return null;
    }
    const endsAt = state.trialEndsAt.getTime();
    const at = now.getTime();
    if (at >= endsAt) {
      return at < endsAt + FREE_TRIAL_NOTICE_GRACE_MS ? 'trial-ended' : null;
    }
    return at >= endsAt - FREE_TRIAL_ENDING_NOTICE_MS ? 'trial-ending' : null;
  }

  private async queue(
    organizationId: string,
    templateKey: FreeTrialEmailTemplateKey,
  ): Promise<boolean> {
    const organization = await this.prisma.organization.findFirst({
      select: {
        billingAccount: {
          select: {
            members: {
              orderBy: { createdAt: 'asc' },
              select: { userId: true },
              take: 1,
              where: {
                isDeleted: false,
                role: BillingAccountMemberRole.OWNER,
              },
            },
          },
        },
        slug: true,
        userId: true,
      },
      where: { id: organizationId, isDeleted: false },
    });
    if (!organization) {
      return false;
    }
    // Once per organization, whoever received it: the sweep re-evaluates the
    // same notice every hour of its window.
    const alreadyQueued = await this.prisma.emailMessage.findFirst({
      select: { id: true },
      where: { isDeleted: false, organizationId, templateKey },
    });
    if (alreadyQueued) {
      return false;
    }
    const definition = FREE_TRIAL_EMAILS[templateKey];
    const appUrl = this.appUrl();
    const organizationUrl = `${appUrl}/${encodeURIComponent(organization.slug)}/~`;
    const creditsUrl = `${organizationUrl}${APP_ROUTES.SETTINGS.CREDITS}`;
    const plansUrl = `${organizationUrl}${APP_ROUTES.SETTINGS.SUBSCRIPTION}`;
    const destinationUrl =
      definition.action === 'plans' ? plansUrl : creditsUrl;
    const paragraphs = [
      ...definition.paragraphs,
      definition.action === 'plans'
        ? `Prefer a one-off pack? Buy credits: ${creditsUrl}`
        : `Compare plans: ${plansUrl}`,
    ];
    const html = buildSystemEmailHtml({
      action: { label: definition.actionLabel, url: destinationUrl },
      appUrl,
      bodyHtml: paragraphs
        .map((paragraph) => buildSystemEmailParagraph(paragraph))
        .join(''),
      footerNote:
        'Manage these emails in your Genfeed notification preferences.',
      preheader: definition.paragraphs[0],
      title: definition.subject,
    }).replaceAll(
      `href="${escapeSystemEmailHtml(destinationUrl)}"`,
      'href="{{emailActionUrl}}"',
    );
    await this.emails.queueEmail({
      destinationUrl,
      goal: 'buy_credits',
      html,
      idempotencyKey: `product:${organizationId}:free-trial:${templateKey}`,
      organizationId,
      subject: definition.subject,
      templateKey,
      topic: TRIAL_EMAIL_TOPICS[templateKey],
      userId:
        organization.billingAccount?.members[0]?.userId ?? organization.userId,
    });
    return true;
  }

  private appUrl(): string {
    return (
      this.config.get('GENFEEDAI_APP_URL') ?? 'https://app.genfeed.ai'
    ).replace(/\/+$/, '');
  }
}
