import {
  linkedInActivityDate,
  normalizeTrackedPostLink,
  parseTrackPostLinkInput,
} from '@api/collections/posts/services/post-link-tracking.util';
import { recordExternalPublicationWrite } from '@api/collections/posts/services/post-publication-capture.write';
import { TwitterService } from '@api/services/integrations/twitter/services/twitter.service';
import { YoutubeMetadataService } from '@api/services/integrations/youtube/services/modules/youtube-metadata.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  ExtensionPublicationCaptureInput,
  ExtensionPublicationCaptureScope,
  TrackPostLinkInput,
} from '@genfeedai/contracts/interfaces/content/extension-publication.interface';
import { CredentialPlatform } from '@genfeedai/prisma';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class PostLinkTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twitter: TwitterService,
    private readonly youtube: YoutubeMetadataService,
  ) {}

  async trackLink(
    input: TrackPostLinkInput,
    scope: ExtensionPublicationCaptureScope,
  ) {
    const parsed = parseTrackPostLinkInput(input);
    if (
      !scope.organizationId ||
      !scope.userId ||
      !scope.brandId ||
      parsed.brandId !== scope.brandId
    )
      throw new ForbiddenException(
        'Post link must match the authenticated brand context',
      );
    const brand = await this.prisma.brand.findFirst({
      where: {
        id: scope.brandId,
        organizationId: scope.organizationId,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (!brand)
      throw new ForbiddenException(
        'Publication brand is unavailable in this organization',
      );

    const normalized = normalizeTrackedPostLink(parsed.url);
    const capture: ExtensionPublicationCaptureInput = {
      brandId: parsed.brandId,
      platform: normalized.platform,
      publicationKind: 'post',
      url: normalized.url ?? parsed.url,
      description: '',
      publicationDate: new Date().toISOString(),
    };
    if (normalized.platform === 'twitter') {
      if (!normalized.externalId)
        throw new BadRequestException('Invalid X post link');
      const credentials = await this.prisma.credential.findMany({
        where: {
          organizationId: scope.organizationId,
          brandId: scope.brandId,
          platform: CredentialPlatform.TWITTER,
          isDeleted: false,
          isConnected: true,
        },
        select: { id: true },
        take: 2,
      });
      let tweet:
        | Awaited<ReturnType<TwitterService['getTweetById']>>
        | undefined;
      if (credentials.length === 1) {
        try {
          tweet = await this.twitter.getTweetById(normalized.externalId, {
            organizationId: scope.organizationId,
            brandId: scope.brandId,
            credentialId: credentials[0].id,
          });
        } catch {
          /* Retry this public read with the app client. */
        }
      }
      if (!tweet) {
        try {
          tweet = await this.twitter.getTweetById(normalized.externalId);
        } catch {
          throw new BadRequestException(
            "Couldn't read that X post. Check the link and that the post is public.",
          );
        }
      }
      if (!tweet.authorId || !tweet.createdAt)
        throw new BadRequestException(
          "Couldn't read that X post's author or publication date",
        );
      capture.description = tweet.text;
      capture.publicationDate = tweet.createdAt;
      capture.author = {
        externalId: tweet.authorId,
        ...(tweet.authorUsername ? { handle: tweet.authorUsername } : {}),
      };
    } else if (normalized.platform === 'youtube') {
      if (!normalized.externalId)
        throw new BadRequestException('Invalid YouTube video link');
      const video = await this.youtube.getVideoMetadata(normalized.externalId);
      if (!video?.channelId || !video.publishedAt)
        throw new BadRequestException(
          "Couldn't read that YouTube video. It may be private, unavailable or not found.",
        );
      capture.description = video.title || video.description || '';
      capture.publicationDate = video.publishedAt.toISOString();
      capture.author = { externalId: video.channelId };
    } else {
      const url = new URL(parsed.url);
      const token = decodeURIComponent(url.pathname);
      const urn = /urn:li:(?:share|ugcPost):\d+/.exec(token)?.[0];
      const activityId = /(?:activity-|urn:li:activity:)(\d+)/.exec(token)?.[1];
      const handle = /\/posts\/([^/_]+)_/.exec(token)?.[1];
      capture.description = parsed.title ?? '';
      capture.publicationDate =
        linkedInActivityDate(activityId)?.toISOString() ??
        parsed.publishedAt ??
        capture.publicationDate;
      if (handle) capture.author = { handle };
      if (urn) capture.externalId = urn;
    }
    return recordExternalPublicationWrite(this.prisma, capture, scope, {
      origin: 'link',
    });
  }
}
