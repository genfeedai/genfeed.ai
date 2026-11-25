import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  X_POSTING_INSUFFICIENT_CREDITS_CODE,
  X_POSTING_REQUIRES_PAID_PLAN_CODE,
  type XPostingBillingErrorCode,
  xPostingBillingMessage,
  xPostingBillingUrl,
} from '@genfeedai/contracts/api-types/contracts/x-posting-billing.contract';
import { xPostCreditCost, xPostHasLink } from '@genfeedai/pricing';
import { Injectable } from '@nestjs/common';

/** Why an X post cannot be sent, with what the person needs to fix it. */
export interface XPostingRefusal {
  code: XPostingBillingErrorCode;
  /** Credits the post would cost; set when the refusal is about credits. */
  cost?: number;
  /** What to tell the person: the reason, the way out and the link. */
  message: string;
  /** The app page that fixes the refusal. */
  upgradeUrl: string;
}

export interface XPostingCheckInput {
  /** The public URL of the app, for the link in the refusal. */
  appUrl: string;
  /**
   * Whether to check the balance too. A post scheduled for later is checked
   * for the plan only: the wallet is read again when it is sent.
   */
  includeCredits: boolean;
  organizationId: string | null | undefined;
  platform: unknown;
  text: string | null | undefined;
}

export function isXPlatform(platform: unknown): boolean {
  const domain = fromPrismaCredentialPlatform(String(platform ?? ''));
  return (
    String(domain ?? platform ?? '').toLowerCase() ===
    CredentialPlatform.TWITTER.toLowerCase()
  );
}

/**
 * Whether an organization may post to X: the one rule behind the synchronous
 * refusal an API or MCP caller gets when it publishes or schedules, and the
 * refusal the worker records on a post it cannot send. X bills Genfeed for
 * every request, so the free plan cannot post and a paid plan pays in credits.
 */
@Injectable()
export class XPostingBillingGate {
  constructor(
    private readonly paidAccess: OrganizationPaidAccessService,
    private readonly credits: CreditsUtilsService,
  ) {}

  /** The refusal for this post, or `null` when it may go to X. */
  async check(input: XPostingCheckInput): Promise<XPostingRefusal | null> {
    if (!isXPlatform(input.platform) || !input.organizationId) {
      return null;
    }

    if (await this.paidAccess.isSubscriptionGatedFresh(input.organizationId)) {
      const code = X_POSTING_REQUIRES_PAID_PLAN_CODE;
      const upgradeUrl = xPostingBillingUrl(code, input.appUrl);
      return {
        code,
        message: xPostingBillingMessage(code, { url: upgradeUrl }),
        upgradeUrl,
      };
    }

    if (!input.includeCredits) {
      return null;
    }

    const cost = xPostCreditCost(input.text);
    const hasCredits = await this.credits.checkOrganizationCreditsAvailable(
      input.organizationId,
      cost,
    );
    if (hasCredits) {
      return null;
    }
    const code = X_POSTING_INSUFFICIENT_CREDITS_CODE;
    const upgradeUrl = xPostingBillingUrl(code, input.appUrl);
    return {
      code,
      cost,
      message: xPostingBillingMessage(code, {
        hasLink: xPostHasLink(input.text),
        url: upgradeUrl,
      }),
      upgradeUrl,
    };
  }
}
