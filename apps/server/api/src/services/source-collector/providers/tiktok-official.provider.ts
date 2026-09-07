import { TiktokService } from '@api/services/integrations/tiktok/services/tiktok.service';
import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  CollectedSourcePost,
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const TIKTOK_ENDPOINT = 'https://open.tiktokapis.com/v2';
/** TikTok Display API hard cap per `video/list` page. */
const PAGE_SIZE = 20;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 15_000;

const VIDEO_FIELDS = [
  'id',
  'create_time',
  'cover_image_url',
  'share_url',
  'embed_link',
  'video_description',
  'title',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
].join(',');

interface TikTokVideoNode {
  comment_count?: unknown;
  cover_image_url?: unknown;
  create_time?: unknown;
  embed_link?: unknown;
  id?: unknown;
  like_count?: unknown;
  share_count?: unknown;
  share_url?: unknown;
  title?: unknown;
  video_description?: unknown;
  view_count?: unknown;
}

interface TikTokVideoListPage {
  data?: {
    cursor?: unknown;
    has_more?: unknown;
    videos?: TikTokVideoNode[];
  };
  error?: { code?: unknown; message?: unknown };
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : undefined;
}

function mapVideoNode(
  node: TikTokVideoNode,
  handle: string,
  authorId: string | undefined,
): CollectedSourcePost | undefined {
  const id = readString(node.id);
  if (!id) {
    return undefined;
  }
  const createTime = readCount(node.create_time);
  const embedLink = readString(node.embed_link);

  return {
    authorId,
    authorUsername: handle,
    contentType: 'video',
    contentUrl: readString(node.share_url),
    createdAt: createTime ? new Date(createTime * 1000) : undefined,
    id,
    mediaUrls: embedLink ? [embedLink] : [],
    metrics: {
      comments: readCount(node.comment_count),
      likes: readCount(node.like_count),
      shares: readCount(node.share_count),
      views: readCount(node.view_count),
    },
    platform: SocialSourcePlatform.TIKTOK,
    text: readString(node.video_description) ?? readString(node.title) ?? '',
    thumbnailUrl: readString(node.cover_image_url),
  };
}

/**
 * Official TikTok Display API provider for the brand's own account.
 *
 * `video/list` only returns the authenticated user's videos, so this provider
 * is own-account only and requires the owning credential. Pages are walked
 * newest-first with TikTok's cursor until the limit or `since` window is hit.
 */
@Injectable()
export class TiktokOfficialProvider implements SourceTimelineProvider {
  readonly name = 'brand-oauth' as const;
  readonly platforms = [SocialSourcePlatform.TIKTOK] as const;

  constructor(
    private readonly httpService: HttpService,
    private readonly tiktokService: TiktokService,
  ) {}

  async canCollect(
    platform: SocialSourcePlatform,
    context: SourceCollectContext,
  ): Promise<boolean> {
    return (
      platform === SocialSourcePlatform.TIKTOK &&
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
        'TikTok official provider requires organizationId, brandId and credentialId',
      );
    }
    const credential = await this.tiktokService.getValidCredential(
      context.organizationId,
      context.brandId,
      context.credentialId,
    );
    if (!credential.accessToken) {
      throw new Error('TikTok credential is missing an access token');
    }
    const accessToken = EncryptionUtil.decrypt(credential.accessToken);
    const authorId = credential.externalId ?? undefined;
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, context.limit ?? DEFAULT_LIMIT),
    );

    const collected: CollectedSourcePost[] = [];
    let cursor: number | undefined;

    while (collected.length < limit) {
      const page = await this.fetchPage(accessToken, cursor);
      const errorCode = readString(page.error?.code);
      if (errorCode && errorCode !== 'ok') {
        throw new Error(
          `TikTok video/list failed: ${readString(page.error?.message) ?? errorCode}`,
        );
      }
      const videos = Array.isArray(page.data?.videos) ? page.data.videos : [];
      if (videos.length === 0) {
        break;
      }

      let isWindowExhausted = false;
      for (const node of videos) {
        const post = mapVideoNode(node, handle, authorId);
        if (!post) {
          continue;
        }
        if (context.sinceId && post.id === context.sinceId) {
          isWindowExhausted = true;
          break;
        }
        if (
          context.since &&
          post.createdAt &&
          post.createdAt.getTime() < context.since.getTime()
        ) {
          isWindowExhausted = true;
          break;
        }
        collected.push(post);
        if (collected.length >= limit) {
          break;
        }
      }

      cursor = readCount(page.data?.cursor);
      if (isWindowExhausted || page.data?.has_more !== true || !cursor) {
        break;
      }
    }

    return {
      handle,
      platform,
      posts: collected,
      provider: 'brand-oauth',
    };
  }

  private async fetchPage(
    accessToken: string,
    cursor: number | undefined,
  ): Promise<TikTokVideoListPage> {
    const response = await firstValueFrom(
      this.httpService.post<TikTokVideoListPage>(
        `${TIKTOK_ENDPOINT}/video/list/?fields=${VIDEO_FIELDS}`,
        { ...(cursor ? { cursor } : {}), max_count: PAGE_SIZE },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
      ),
    );
    return response.data ?? {};
  }
}
