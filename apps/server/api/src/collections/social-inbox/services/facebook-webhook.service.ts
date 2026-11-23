import { extractFacebookInboxPageIds } from '@api/collections/social-inbox/services/facebook-webhook.util';
import {
  safeEqualStrings,
  verifyMetaWebhookSignature,
} from '@api/collections/social-inbox/services/instagram-webhook.util';
import { SocialInboxSyncWorkflowService } from '@api/collections/social-inbox/services/social-inbox-sync-workflow.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { isUnconfiguredSecret } from '@genfeedai/config';
import { Platform, SocialConversationType } from '@genfeedai/contracts';
import { CredentialPlatform as PrismaCredentialPlatform } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/** Coalesces a burst of comments and messages on one Page into a single inbox sync. */
const INBOX_SYNC_DEBOUNCE_SECONDS = 3;

export interface FacebookWebhookResult {
  enqueued: number;
  pages: number;
}

/**
 * Real-time intake for comments and Messenger messages on a connected Facebook
 * Page. Meta says a Page received one; the Graph sync then fetches it, so a
 * webhook and a manual Sync share one ingest path, one conversation id and one
 * set of dedupe keys.
 */
@Traced()
@Injectable()
export class FacebookWebhookService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly prisma: PrismaService,
    private readonly redisService: RedisService,
    private readonly syncWorkflowService: SocialInboxSyncWorkflowService,
  ) {}

  /**
   * Answers Meta's subscription handshake with the `hub.challenge` value. The
   * Meta app holds one verify token for every webhook object it receives, so
   * this reads the same setting as the Instagram webhook.
   */
  verifyChallenge(
    mode: string | undefined,
    verifyToken: string | undefined,
    challenge: string | undefined,
  ): string {
    const expected = this.readConfigString('INSTAGRAM_WEBHOOK_VERIFY_TOKEN');
    if (!expected) {
      throw new ServiceUnavailableException(
        'Facebook webhooks are not configured for this deployment.',
      );
    }

    if (
      mode !== 'subscribe' ||
      !verifyToken ||
      !challenge ||
      !safeEqualStrings(verifyToken, expected)
    ) {
      throw new ForbiddenException('Webhook verification failed');
    }

    return challenge;
  }

  async receiveEvent(
    rawBody: unknown,
    signature: string | undefined,
  ): Promise<FacebookWebhookResult> {
    if (!Buffer.isBuffer(rawBody)) {
      throw new BadRequestException('Raw request body is required');
    }

    const appSecrets = this.getAppSecrets();
    if (appSecrets.length === 0) {
      throw new ServiceUnavailableException(
        'Facebook webhooks are not configured for this deployment.',
      );
    }

    if (!verifyMetaWebhookSignature(rawBody, signature, appSecrets)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Webhook body is not valid JSON');
    }

    const pageIds = extractFacebookInboxPageIds(payload);
    let enqueued = 0;

    for (const pageId of pageIds) {
      enqueued += await this.enqueueInboxSync(pageId);
    }

    return { enqueued, pages: pageIds.length };
  }

  private async enqueueInboxSync(pageId: string): Promise<number> {
    // tenant-scope-ignore: Meta supplies only the Page id in a signature-verified delivery, so this cross-tenant routing lookup returns the owning organizationId and every sync below is pinned to that resolved tenant
    const credentials = await this.prisma.credential.findMany({
      select: { brandId: true, id: true, organizationId: true, userId: true },
      // A Page is connected by a handful of organizations at most.
      take: 25,
      where: {
        externalId: pageId,
        isConnected: true,
        isDeleted: false,
        platform: PrismaCredentialPlatform.FACEBOOK,
      },
    });

    let enqueued = 0;

    for (const credential of credentials) {
      if (!credential.organizationId || !credential.brandId) {
        continue;
      }

      try {
        if (!(await this.acquireDebounce(credential.id))) {
          continue;
        }

        await this.syncWorkflowService.enqueue({
          brandId: credential.brandId,
          conversationType: SocialConversationType.COMMENT,
          credentialId: credential.id,
          organizationId: credential.organizationId,
          platform: Platform.FACEBOOK,
          userId: credential.userId ?? undefined,
        });
        enqueued += 1;
      } catch (error: unknown) {
        // Answer 200 anyway: a non-2xx makes Meta retry and, after an hour of
        // failures, unsubscribe the Page. The next webhook or a manual Sync
        // fetches it.
        this.logger.error(`${this.constructorName} inbox sync enqueue failed`, {
          credentialId: credential.id,
          error: error instanceof Error ? error.message : 'unknown',
        });
      }
    }

    return enqueued;
  }

  private async acquireDebounce(credentialId: string): Promise<boolean> {
    const publisher = this.redisService.getPublisher();
    if (!publisher) {
      return true;
    }

    const acquired = await publisher.set(
      `facebook:webhook:inbox-sync:${credentialId}`,
      new Date().toISOString(),
      'EX',
      INBOX_SYNC_DEBOUNCE_SECONDS,
      'NX',
    );

    return acquired !== null;
  }

  /** The Meta app may be configured under either name; either can sign. */
  private getAppSecrets(): string[] {
    return [
      this.readConfigString('FACEBOOK_APP_SECRET'),
      this.readConfigString('INSTAGRAM_APP_SECRET'),
    ].filter((secret): secret is string => secret !== undefined);
  }

  private readConfigString(key: string): string | undefined {
    const value = this.configService.get(key);
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length === 0 || isUnconfiguredSecret(trimmed)
      ? undefined
      : trimmed;
  }
}
