import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import {
  isXPlatform,
  XPostingBillingGate,
} from '@api/common/subscriptions/x-posting-billing-gate.service';
import { type PublishResult, scopedWhere } from '@api/index';
import {
  ActivitySource,
  CredentialPlatform,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { xPostCreditCost, xPostHasLink } from '@genfeedai/pricing';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import { readPostString } from '@workers/services/scheduled-post.utils';
import type { DeliveryGateFailure } from '@workers/services/scheduled-post-delivery.types';

const DEFAULT_APP_URL = 'https://app.genfeed.ai';

/** One published X post (or thread reply) the organization is charged for. */
export interface XPublishedPost {
  brandId?: string | null;
  organizationId: string;
  postId: string;
  text: string | null | undefined;
  userId: string | null | undefined;
}

/**
 * What posting to X costs the organization. X bills Genfeed for every request,
 * so X posting is a paid-plan feature and every published post is charged in
 * credits. The gate runs before the provider call; the charge runs after the
 * provider accepted the post, so it can never fail a publish that happened.
 */
@Injectable()
export class ScheduledPostXBilling {
  constructor(
    private readonly logger: LoggerService,
    private readonly gate: XPostingBillingGate,
    private readonly credits: CreditsUtilsService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Refuses an X post before it is sent: an organization on the free plan
   * (including one that only holds free credits) cannot post to X, and a paid
   * one needs enough credits for the post. Other platforms pass. The failure
   * carries the reason and the link that fixes it, because it is what the owner
   * reads in the app, the alert and any webhook.
   */
  async checkCanPublish(input: {
    organizationId: string | null | undefined;
    platform: unknown;
    postId: string;
    text: string | null | undefined;
    url: string;
  }): Promise<DeliveryGateFailure | null> {
    const refusal = await this.gate.check({
      appUrl: this.configService.get('GENFEEDAI_APP_URL') || DEFAULT_APP_URL,
      includeCredits: true,
      organizationId: input.organizationId,
      platform: input.platform,
      text: input.text,
    });
    if (!refusal) {
      return null;
    }
    this.logger.warn(`${input.url} X posting blocked: ${refusal.code}`, {
      code: refusal.code,
      cost: refusal.cost,
      organizationId: input.organizationId,
      postId: input.postId,
    });
    return {
      code: refusal.code,
      isRetryable: false,
      message: refusal.message,
      platform: CredentialPlatform.TWITTER,
    };
  }

  /**
   * Charges the X post a provider accepted. A post parked for verification is
   * charged when its verification later replays as published.
   */
  async chargeAcceptedPublish(
    post: PostEntity,
    platform: unknown,
    result: PublishResult,
  ): Promise<void> {
    const organizationId = readPostString(post, ['organizationId']);
    if (
      !isXPlatform(platform) ||
      !organizationId ||
      !result.externalId ||
      result.isProviderDraft === true ||
      result.executionState === TargetExecutionState.PUBLISHING
    ) {
      return;
    }
    await this.chargePublished({
      brandId: readPostString(post, ['brandId']),
      organizationId,
      postId: post.id.toString(),
      text: post.description,
      userId: readPostString(post, ['userId']),
    });
  }

  /**
   * Charges one published X post. Keyed by post id, so a replayed publish or a
   * retried sweep charges once. Never throws: the provider already took the
   * post, and a billing fault must not send it down the publish retry path.
   */
  async chargePublished(post: XPublishedPost): Promise<void> {
    const cost = xPostCreditCost(post.text);
    const hasLink = xPostHasLink(post.text);
    try {
      await this.credits.deductCreditsFromOrganization(
        post.organizationId,
        post.userId ?? '',
        cost,
        hasLink ? 'X post with a link published' : 'X post published',
        ActivitySource.SCRIPT,
        {
          brandId: post.brandId ?? null,
          idempotencyKey: `x-post-publish:${post.postId}`,
          // The post is already live: settle even when the balance has since
          // dropped below the price.
          maxOverdraftCredits: cost,
          metadata: { hasLink, platform: 'twitter', postId: post.postId },
        },
      );
    } catch (error: unknown) {
      this.logger.error('ScheduledPostXBilling failed to charge an X post', {
        error: getErrorMessage(error),
        organizationId: post.organizationId,
        postId: post.postId,
      });
    }
  }

  /**
   * Charges the thread replies of a parent that X accepted. The publisher
   * marks each reply it sent PUBLISHED, so the charge follows that state and
   * replies that failed cost nothing.
   */
  async chargePublishedThreadChildren(input: {
    brandId?: string | null;
    children: Array<{ description?: string | null; id: string }>;
    organizationId: string;
    userId: string | null | undefined;
  }): Promise<void> {
    if (input.children.length === 0) {
      return;
    }
    try {
      const published = await this.prisma.post.findMany({
        select: { id: true },
        where: scopedWhere(input.organizationId, {
          id: { in: input.children.map((child) => child.id) },
          isDeleted: false,
          targetExecutionState: TargetExecutionState.PUBLISHED,
        }),
      });
      const publishedIds = new Set(published.map((row) => row.id));
      for (const child of input.children) {
        if (!publishedIds.has(child.id)) {
          continue;
        }
        await this.chargePublished({
          brandId: input.brandId,
          organizationId: input.organizationId,
          postId: child.id,
          text: child.description,
          userId: input.userId,
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        'ScheduledPostXBilling failed to charge thread replies',
        {
          error: getErrorMessage(error),
          organizationId: input.organizationId,
        },
      );
    }
  }
}
