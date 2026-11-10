import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import type { Prisma } from '@genfeedai/prisma';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/**
 * Applies signed provider receipts (stored by the shared email webhook) to
 * newsletter recipients (#9726, #9727). Bounces and complaints also flip the
 * subscriber and write the global suppression entry.
 */
@Traced()
@Injectable()
export class NewsletterProviderEventsService {
  constructor(private readonly prisma: PrismaService) {}

  /** True when the provider message belongs to a newsletter recipient. */
  async reconcile(providerMessageId: string): Promise<boolean> {
    // tenant-scope-ignore: a signed provider message id resolves its recipient, and so its organization, before any write.
    const recipient = await this.prisma.newsletterSendRecipient.findFirst({
      select: {
        id: true,
        organizationId: true,
        recipientHash: true,
        subscriberId: true,
      },
      where: { isDeleted: false, providerMessageId },
    });
    if (!recipient) return false;
    // tenant-scope-ignore: provider receipts carry no tenant; only this verified message's receipts are read.
    const events = await this.prisma.emailProviderEvent.findMany({
      orderBy: { occurredAt: 'asc' },
      select: { eventType: true, id: true, occurredAt: true },
      take: 100,
      where: { processedAt: null, providerMessageId },
    });
    for (const event of events) {
      await this.prisma.$transaction(async (tx) => {
        await this.apply(tx, recipient, event.eventType, event.occurredAt);
        // tenant-scope-ignore: the receipt was signature-verified and resolved to the scoped recipient above.
        await tx.emailProviderEvent.update({
          data: { processedAt: new Date() },
          where: { id: event.id },
        });
      });
    }
    return true;
  }

  private async apply(
    tx: Prisma.TransactionClient,
    recipient: {
      id: string;
      organizationId: string;
      recipientHash: string;
      subscriberId: string;
    },
    eventType: string,
    occurredAt: Date,
  ): Promise<void> {
    const orgId = recipient.organizationId;
    const firstTime = (field: 'deliveredAt' | 'openedAt' | 'clickedAt') =>
      // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one recipient inside its organization; the null predicate keeps the first receipt.
      tx.newsletterSendRecipient.updateMany({
        data: { [field]: occurredAt },
        where: scopedWhere(orgId, { [field]: null, id: recipient.id }),
      });
    switch (eventType) {
      case 'email.delivered':
        await firstTime('deliveredAt');
        return;
      case 'email.opened':
        await firstTime('openedAt');
        // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one recipient inside its organization.
        await tx.newsletterSendRecipient.updateMany({
          data: { openCount: { increment: 1 } },
          where: scopedWhere(orgId, { id: recipient.id }),
        });
        return;
      case 'email.clicked':
        // Link-level counts come from the first-party redirect.
        await firstTime('clickedAt');
        return;
      case 'email.bounced':
      case 'email.complained': {
        const isBounce = eventType === 'email.bounced';
        // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one recipient inside its organization.
        await tx.newsletterSendRecipient.updateMany({
          data: isBounce
            ? { bouncedAt: occurredAt }
            : { complainedAt: occurredAt },
          where: scopedWhere(orgId, { id: recipient.id }),
        });
        // sql-risk-audit: ignore bulk-write-tenant-review -- scopedWhere pins one subscriber inside its organization.
        await tx.brandSubscriber.updateMany({
          data: isBounce
            ? { bouncedAt: occurredAt, status: 'bounced' }
            : { complainedAt: occurredAt, status: 'complained' },
          where: scopedWhere(orgId, { id: recipient.subscriberId }),
        });
        // tenant-scope-ignore: recipient suppression is deliberately global deliverability state.
        await tx.emailSuppression.upsert({
          create: { reason: eventType, recipientHash: recipient.recipientHash },
          update: { reason: eventType },
          where: { recipientHash: recipient.recipientHash },
        });
        return;
      }
      default:
        return;
    }
  }
}
