/**
 * X Activity / Account Activity webhook intake.
 * Pipes only — subscription registration is connect-later.
 */

import { ReplyInboundProcessorService } from '@api/services/reply-bot/reply-inbound-processor.service';
import { buildXActivityCrcResponseBody } from '@api/services/reply-bot/x-activity-crc.util';
import { extractInboundCandidatesFromXActivityPayload } from '@api/services/reply-bot/x-activity-event.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { toPrismaCredentialPlatform } from '@genfeedai/enums';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type XActivityIntakeResult = {
  enqueued: number;
  ignored: number;
  mode: 'live' | 'disabled' | 'missing-secret';
};

@Injectable()
export class XActivityWebhookService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly replyInboundProcessorService: ReplyInboundProcessorService,
  ) {}

  isEnabled(): boolean {
    const flag = this.configService.get<string>('X_ACTIVITY_WEBHOOK_ENABLED');
    return flag === 'true' || flag === '1';
  }

  getConsumerSecret(): string | undefined {
    return (
      this.readConfigString('X_WEBHOOK_CONSUMER_SECRET') ||
      this.readConfigString('TWITTER_CONSUMER_SECRET') ||
      undefined
    );
  }

  private readConfigString(key: string): string | undefined {
    const value = this.configService.get(key);
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * CRC challenge for webhook registration (always available when secret set).
   */
  handleCrcChallenge(crcToken: string): { response_token: string } {
    const secret = this.getConsumerSecret();
    if (!secret) {
      throw new Error(
        'X_WEBHOOK_CONSUMER_SECRET or TWITTER_CONSUMER_SECRET is required for CRC',
      );
    }
    return buildXActivityCrcResponseBody(crcToken, secret);
  }

  /**
   * Accept webhook POST, map to inbound jobs. Safe no-op when disabled.
   */
  async handleEventPayload(payload: unknown): Promise<XActivityIntakeResult> {
    if (!this.isEnabled()) {
      this.logger.log(
        `${this.constructorName} received payload while disabled (pipe ready)`,
        { enabled: false },
      );
      return { enqueued: 0, ignored: 0, mode: 'disabled' };
    }

    const candidates = extractInboundCandidatesFromXActivityPayload(payload);
    if (candidates.length === 0) {
      return { enqueued: 0, ignored: 0, mode: 'live' };
    }

    let enqueued = 0;
    let ignored = 0;

    for (const candidate of candidates) {
      const resolved = await this.resolveSubscription(candidate.forUserId);
      if (!resolved) {
        ignored += 1;
        this.logger.warn(
          `${this.constructorName} no credential for activity user`,
          { forUserId: candidate.forUserId },
        );
        continue;
      }

      await this.replyInboundProcessorService.enqueue({
        brandId: resolved.brandId,
        commentAuthorId: candidate.commentAuthorId,
        commentAuthorUsername: candidate.commentAuthorUsername,
        commentId: candidate.commentId,
        commentText: candidate.commentText,
        credentialId: resolved.credentialId,
        organizationId: resolved.organizationId,
        parentPostId: candidate.parentPostId,
        receivedAt: new Date().toISOString(),
        source: 'xaa',
      });
      enqueued += 1;
    }

    this.logger.log(`${this.constructorName} intake complete`, {
      enqueued,
      ignored,
    });

    return { enqueued, ignored, mode: 'live' };
  }

  /**
   * Resolve X external user id → brand credential (connect-later mapping).
   */
  private async resolveSubscription(forUserId: string | undefined): Promise<{
    brandId?: string;
    credentialId: string;
    organizationId: string;
  } | null> {
    if (!forUserId) {
      return null;
    }

    const platform = toPrismaCredentialPlatform('twitter');
    if (!platform) {
      return null;
    }

    // tenant-scope-ignore: X supplies only an external user id, so this cross-tenant routing lookup returns the owning organizationId and every downstream queue operation is pinned to that resolved tenant
    const credential = await this.prisma.credential.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        brandId: true,
        id: true,
        organizationId: true,
      },
      where: {
        externalId: forUserId,
        isDeleted: false,
        platform,
      },
    });

    if (!credential?.organizationId) {
      return null;
    }

    return {
      brandId: credential.brandId ?? undefined,
      credentialId: credential.id,
      organizationId: credential.organizationId,
    };
  }
}
