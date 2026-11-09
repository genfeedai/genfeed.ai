import { type CredentialDocument } from '@api/collections/credentials/schemas/credential.schema';
import { isGenfeedProfilePublic } from '@api/collections/credentials/utils/genfeed-profile-readiness.util';
import { scopedWhere } from '@api/index';
import { BasePublisherService } from '@api/services/integrations/publishers/base-publisher.service';
import type {
  PublishContext,
  PublishResult,
} from '@api/services/integrations/publishers/interfaces/publisher.interface';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { creatorPostPath } from '@genfeedai/contracts/constants';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

const TRAILING_SLASH_PATTERN = /\/+$/;

/**
 * Publishes to the creator profile at genfeed.ai/@handle. Nothing leaves
 * Genfeed: the post itself is the published item, so publishing confirms the
 * brand profile is public and hands back the post's own page. Its id is the
 * external id, which keeps the receipt and the analytics joins uniform with
 * every other channel.
 */
@Traced()
@Injectable()
export class GenfeedPublisherService extends BasePublisherService {
  readonly platform = CredentialPlatform.GENFEED;
  readonly supportsTextOnly = true;
  readonly supportsImages = true;
  readonly supportsVideos = true;
  readonly supportsCarousel = true;
  readonly supportsThreads = false;

  constructor(
    protected readonly configService: ConfigService,
    protected readonly logger: LoggerService,
    private readonly prisma: PrismaService,
  ) {
    super(configService, logger);
  }

  async publish(context: PublishContext): Promise<PublishResult> {
    const brand = await this.prisma.brand.findFirst({
      select: { isDeleted: true, scope: true, slug: true },
      where: scopedWhere(context.organizationId, { id: context.brandId }),
    });

    if (!brand || !isGenfeedProfilePublic(brand)) {
      return this.createFailedResult(
        this.platform,
        'This brand profile is private, so genfeed.ai cannot show the post. Make the profile public in brand settings.',
        'genfeed_profile_private',
      );
    }

    return this.createSuccessResult(
      context.postId,
      this.platform,
      this.buildProfilePostUrl(brand.slug, context.postId),
    );
  }

  buildPostUrl(externalId: string, credential: CredentialDocument): string {
    return this.buildProfilePostUrl(
      credential.externalHandle ?? '',
      externalId,
    );
  }

  private buildProfilePostUrl(handle: string, postId: string): string {
    const siteUrl = (this.configService.get('GENFEEDAI_PUBLIC_URL') ?? '')
      .toString()
      .replace(TRAILING_SLASH_PATTERN, '');
    return `${siteUrl}${creatorPostPath(handle, postId)}`;
  }
}
