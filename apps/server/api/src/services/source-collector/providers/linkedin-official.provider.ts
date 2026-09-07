import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { LinkedInService } from '@api/services/integrations/linkedin/services/linkedin.service';
import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  CollectedSourcePost,
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import { CredentialPlatform, SocialSourcePlatform } from '@genfeedai/contracts';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const LINKEDIN_API = 'https://api.linkedin.com/v2';
const PAGE_SIZE = 50;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 15_000;
const SOCIAL_ACTIONS_CONCURRENCY = 10;

interface LinkedinUgcPostsPage {
  elements?: Array<{
    author?: unknown;
    created?: { time?: unknown };
    id?: unknown;
    specificContent?: {
      'com.linkedin.ugc.ShareContent'?: {
        media?: Array<{
          originalUrl?: unknown;
          thumbnails?: Array<{ url?: unknown }>;
        }>;
        shareCommentary?: { text?: unknown };
        shareMediaCategory?: unknown;
      };
    };
  }>;
  paging?: { total?: unknown };
}

interface LinkedinSocialActions {
  commentsSummary?: { totalFirstLevelComments?: unknown };
  likesSummary?: { totalLikes?: unknown };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function toContentType(category: string | undefined): string {
  switch (category?.toUpperCase()) {
    case 'VIDEO':
      return 'video';
    case 'IMAGE':
    case 'RICH':
      return 'image';
    case 'ARTICLE':
      return 'article';
    default:
      return 'post';
  }
}

/**
 * Official LinkedIn provider for the member profile behind a credential.
 *
 * Lists the member's UGC posts newest-first with `start` offsets and attaches
 * like and comment counts from `socialActions`, until the limit or the
 * `since` window is hit. Own-account only: `ugcPosts?q=authors` accepts only
 * URNs the token owns, so a `credentialId` is required.
 */
@Injectable()
export class LinkedinOfficialProvider implements SourceTimelineProvider {
  readonly name = 'brand-oauth' as const;
  readonly platforms = [SocialSourcePlatform.LINKEDIN] as const;

  constructor(
    private readonly httpService: HttpService,
    private readonly credentialsService: CredentialsService,
    private readonly linkedInService: LinkedInService,
  ) {}

  async canCollect(
    platform: SocialSourcePlatform,
    context: SourceCollectContext,
  ): Promise<boolean> {
    return (
      platform === SocialSourcePlatform.LINKEDIN &&
      Boolean(context.organizationId) &&
      Boolean(context.brandId) &&
      Boolean(context.credentialId)
    );
  }

  async collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult> {
    if (!context.organizationId || !context.brandId || !context.credentialId) {
      throw new Error(
        'LinkedIn official provider requires organizationId, brandId and credentialId',
      );
    }
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId: context.brandId,
      credentialId: context.credentialId,
      organizationId: context.organizationId,
      platform: CredentialPlatform.LINKEDIN,
    });
    if (!credential) {
      throw new Error('LinkedIn credential not found');
    }
    const memberId = readString(credential.externalId);
    if (!memberId) {
      throw new Error('LinkedIn credential is missing its member id');
    }
    const accessToken = await this.resolveAccessToken(
      context.organizationId,
      context.brandId,
      credential,
    );
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, context.limit ?? DEFAULT_LIMIT),
    );
    const posts = await this.paginatePosts(
      accessToken,
      `urn:li:person:${memberId}`,
      handle,
      credential.externalName ?? undefined,
      limit,
      context,
    );
    await this.attachSocialActions(accessToken, posts);

    return { handle, platform, posts, provider: 'brand-oauth' };
  }

  private async resolveAccessToken(
    organizationId: string,
    brandId: string,
    credential: {
      accessToken: string | null;
      accessTokenExpiry: Date | null;
    },
  ): Promise<string> {
    const expiry = credential.accessTokenExpiry
      ? new Date(credential.accessTokenExpiry)
      : undefined;
    const isExpired =
      expiry !== undefined &&
      !Number.isNaN(expiry.getTime()) &&
      expiry.getTime() <= Date.now();
    if (isExpired) {
      const refreshed = await this.linkedInService.refreshToken(
        organizationId,
        brandId,
      );
      const storedToken = refreshed.accessToken ?? credential.accessToken;
      if (!storedToken) {
        throw new Error('LinkedIn credential is missing an access token');
      }
      return EncryptionUtil.decrypt(storedToken);
    }
    if (!credential.accessToken) {
      throw new Error('LinkedIn credential is missing an access token');
    }
    return EncryptionUtil.decrypt(credential.accessToken);
  }

  private async paginatePosts(
    accessToken: string,
    authorUrn: string,
    handle: string,
    displayName: string | undefined,
    limit: number,
    context: SourceCollectContext,
  ): Promise<CollectedSourcePost[]> {
    const collected: CollectedSourcePost[] = [];
    let start = 0;

    while (collected.length < limit) {
      const response = await firstValueFrom(
        this.httpService.get<LinkedinUgcPostsPage>(`${LINKEDIN_API}/ugcPosts`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Restli-Protocol-Version': '2.0.0',
          },
          params: {
            authors: `List(${authorUrn})`,
            count: PAGE_SIZE,
            q: 'authors',
            sortBy: 'LAST_MODIFIED',
            start,
          },
          timeout: REQUEST_TIMEOUT_MS,
        }),
      );
      const elements = Array.isArray(response.data?.elements)
        ? response.data.elements
        : [];
      if (elements.length === 0) {
        break;
      }

      let isWindowExhausted = false;
      for (const node of elements) {
        const id = readString(node.id);
        if (!id) continue;
        if (context.sinceId && id === context.sinceId) {
          isWindowExhausted = true;
          break;
        }
        const createdMs = readCount(node.created?.time);
        const createdAt = createdMs ? new Date(createdMs) : undefined;
        if (
          context.since &&
          createdAt &&
          createdAt.getTime() < context.since.getTime()
        ) {
          isWindowExhausted = true;
          break;
        }
        const share = node.specificContent?.['com.linkedin.ugc.ShareContent'];
        const media = Array.isArray(share?.media) ? share.media : [];
        const mediaUrls = media
          .map((item) => readString(item.originalUrl))
          .filter((url): url is string => Boolean(url));
        const thumbnailUrl = media
          .flatMap((item) => item.thumbnails ?? [])
          .map((thumbnail) => readString(thumbnail.url))
          .find((url): url is string => Boolean(url));
        collected.push({
          authorDisplayName: displayName,
          authorId: authorUrn,
          authorUsername: handle,
          contentType: toContentType(readString(share?.shareMediaCategory)),
          contentUrl: `https://www.linkedin.com/feed/update/${id}`,
          createdAt,
          id,
          mediaUrls,
          metrics: {},
          platform: SocialSourcePlatform.LINKEDIN,
          text: readString(share?.shareCommentary?.text) ?? '',
          thumbnailUrl,
        });
        if (collected.length >= limit) break;
      }

      const total = readCount(response.data?.paging?.total);
      start += elements.length;
      if (
        isWindowExhausted ||
        elements.length < PAGE_SIZE ||
        (total !== undefined && start >= total)
      ) {
        break;
      }
    }

    return collected;
  }

  /** Per-post engagement; a failed lookup leaves that post's metrics empty. */
  private async attachSocialActions(
    accessToken: string,
    posts: CollectedSourcePost[],
  ): Promise<void> {
    for (
      let index = 0;
      index < posts.length;
      index += SOCIAL_ACTIONS_CONCURRENCY
    ) {
      const batch = posts.slice(index, index + SOCIAL_ACTIONS_CONCURRENCY);
      await Promise.all(
        batch.map(async (post) => {
          try {
            const response = await firstValueFrom(
              this.httpService.get<LinkedinSocialActions>(
                `${LINKEDIN_API}/socialActions/${encodeURIComponent(post.id)}`,
                {
                  headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'X-Restli-Protocol-Version': '2.0.0',
                  },
                  timeout: REQUEST_TIMEOUT_MS,
                },
              ),
            );
            post.metrics = {
              comments: readCount(
                response.data?.commentsSummary?.totalFirstLevelComments,
              ),
              likes: readCount(response.data?.likesSummary?.totalLikes),
            };
          } catch {
            // Engagement is best-effort; the post itself is still imported.
          }
        }),
      );
    }
  }
}
