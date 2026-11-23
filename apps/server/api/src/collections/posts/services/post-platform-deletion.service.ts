import { MastodonService } from '@api/services/integrations/mastodon/services/mastodon.service';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { scopedWhere } from '@api/tenancy/scoped-where';
import { CredentialPlatform } from '@genfeedai/contracts';
import { supportsPostDeletionOnPlatform } from '@genfeedai/contracts/constants';
import type { PostPlatformDeletionStatus } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';

/** The fields of a post the network delete needs. */
export interface PostForPlatformDeletion {
  brandId: string;
  credentialId: string | null;
  externalId: string | null;
  id: string;
  platform: string | null;
  status: string;
}

const PLATFORM_LABELS: Record<string, string> = {
  [CredentialPlatform.MASTODON]: 'Mastodon',
  [CredentialPlatform.TWITTER]: 'X',
};

/**
 * Deletes a published post on its social network, with the account the post
 * was published from. Only platforms in `PLATFORMS_WITH_POST_DELETION` are
 * wired; for any other the call is refused before anything is deleted, so a
 * caller never believes a network copy is gone when it is not.
 */
@Traced()
@Injectable()
export class PostPlatformDeletionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twitterService: TwitterService,
    private readonly mastodonService: MastodonService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * `deleted` once the provider confirms the post is gone, `not-published`
   * when the post never reached a network. Throws when the platform is not
   * supported or the provider refuses, so the caller deletes nothing.
   */
  async deleteOnPlatform(
    organizationId: string,
    post: PostForPlatformDeletion,
  ): Promise<Extract<PostPlatformDeletionStatus, 'deleted' | 'not-published'>> {
    if (!post.externalId) {
      return 'not-published';
    }
    if (!supportsPostDeletionOnPlatform(post.platform)) {
      throw new BadRequestException(
        `Deleting on ${post.platform ?? 'this network'} is not supported yet. Delete without deleting on the platform to remove it from Genfeed only; the network copy stays.`,
      );
    }

    const platform = String(post.platform).toLowerCase();
    const label = PLATFORM_LABELS[platform] ?? platform;
    try {
      if (platform === CredentialPlatform.TWITTER) {
        const result = await this.twitterService.deleteTweet(
          organizationId,
          post.brandId,
          post.externalId,
          post.credentialId ?? undefined,
        );
        if (!result.deleted) {
          throw new Error(`${label} did not confirm the delete`);
        }
      } else {
        await this.deleteMastodonStatus(
          organizationId,
          post.credentialId,
          post.externalId,
        );
      }
    } catch (error: unknown) {
      this.logger.error('Platform delete failed', {
        error: error instanceof Error ? error.message : String(error),
        organizationId,
        platform,
        postId: post.id,
      });
      throw new BadGatewayException(
        `${label} did not delete the post, so nothing was deleted. Reconnect the account if it expired, or delete without deleting on the platform.`,
      );
    }
    return 'deleted';
  }

  private async deleteMastodonStatus(
    organizationId: string,
    credentialId: string | null,
    statusId: string,
  ): Promise<void> {
    const credential = credentialId
      ? await this.prisma.credential.findFirst({
          select: { accessToken: true, description: true },
          where: scopedWhere(organizationId, { id: credentialId }),
        })
      : null;
    if (!credential?.accessToken || !credential.description) {
      throw new Error('Mastodon credential or instance URL not found');
    }
    await this.mastodonService.deleteStatus(
      credential.description,
      EncryptionUtil.decrypt(credential.accessToken),
      statusId,
    );
  }
}
