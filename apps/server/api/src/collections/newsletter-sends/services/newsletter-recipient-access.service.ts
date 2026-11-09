import { CreatorSubscriptionsService } from '@api/collections/creator-payments/services/creator-subscriptions.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { NewsletterAccessLevel } from '@genfeedai/contracts/constants';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

export interface NewsletterAccessSubscriber {
  id: string;
  organizationId: string;
}

export interface NewsletterAccessIssue {
  accessLevel: NewsletterAccessLevel;
  brandId: string;
}

/**
 * Whether a subscriber receives an issue in full or as a preview (#9718).
 * Every subscriber reads public and subscriber-only issues. A paid issue goes
 * out in full only to a subscriber whose Genfeed account has a live paid
 * subscription to the brand (#9717); everyone else gets the preview.
 */
@Traced()
@Injectable()
export class NewsletterRecipientAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creatorSubscriptions: CreatorSubscriptionsService,
  ) {}

  async hasFullAccess(
    subscriber: NewsletterAccessSubscriber,
    issue: NewsletterAccessIssue,
  ): Promise<boolean> {
    if (issue.accessLevel !== 'paid') {
      return true;
    }
    const organizationId = subscriber.organizationId;
    const account = await runWithTenantContext(
      { organizationId },
      async () =>
        await this.prisma.brandSubscriber.findFirst({
          select: { userId: true },
          where: scopedWhere(organizationId, { id: subscriber.id }),
        }),
    );
    if (!account?.userId) {
      return false;
    }
    return await this.creatorSubscriptions.hasActivePaidSubscription(
      organizationId,
      issue.brandId,
      account.userId,
    );
  }
}
