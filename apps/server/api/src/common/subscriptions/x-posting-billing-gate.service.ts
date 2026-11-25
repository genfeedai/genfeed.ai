import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import {
  CredentialPlatform,
  fromPrismaCredentialPlatform,
} from '@genfeedai/contracts';
import {
  X_POSTING_INSUFFICIENT_CREDITS_CODE,
  xPostingBillingMessage,
  xPostingBillingUrl,
} from '@genfeedai/contracts/api-types/contracts/x-posting-billing.contract';
import { xPostCreditCost, xPostHasLink } from '@genfeedai/pricing';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** Why an X post cannot be sent, with what the person needs to fix it. */
export interface XPostingRefusal {
  code: typeof X_POSTING_INSUFFICIENT_CREDITS_CODE;
  /** Credits the post would cost. */
  cost: number;
  /** What to tell the person: the reason, the way out and the link. */
  message: string;
  /** The page where credits are bought. */
  upgradeUrl: string;
}

export interface XPostingCheckInput {
  /** The public URL of the app, for the link in the refusal. */
  appUrl: string;
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
 * Whether an organization can pay for an X post: the one rule behind the
 * synchronous refusal an API or MCP caller gets when it publishes, and the
 * refusal the worker records on a post it cannot send. X bills Genfeed for
 * every request, so each post costs credits. X is not paywalled: any account
 * with credits may post, inside the daily caps every platform shares.
 */
@Traced()
@Injectable()
export class XPostingBillingGate {
  constructor(private readonly credits: CreditsUtilsService) {}

  /** The refusal for this post, or `null` when its wallet can pay for it. */
  async check(input: XPostingCheckInput): Promise<XPostingRefusal | null> {
    if (!isXPlatform(input.platform) || !input.organizationId) {
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
    const upgradeUrl = xPostingBillingUrl(input.appUrl);
    return {
      code: X_POSTING_INSUFFICIENT_CREDITS_CODE,
      cost,
      message: xPostingBillingMessage({
        hasLink: xPostHasLink(input.text),
        url: upgradeUrl,
      }),
      upgradeUrl,
    };
  }
}
