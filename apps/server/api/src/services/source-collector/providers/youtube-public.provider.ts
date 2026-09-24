import type { SourceTimelineProvider } from '@api/services/source-collector/source-collector.interface';
import type {
  CollectedSourcePost,
  SourceCollectContext,
  SourceCollectResult,
} from '@api/services/source-collector/source-collector.types';
import { SocialSourcePlatform } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

const API_URL = 'https://www.googleapis.com/youtube/v3';
const CHANNEL_ID = /^UC[a-zA-Z0-9_-]{22}$/;
const VIDEO_ID = /^[a-zA-Z0-9_-]{11}$/;
const PAGE_SIZE = 50;
const MAX_PAGES = 10;

class YoutubePublicError extends Error {}

function apiFailure(error: unknown): YoutubePublicError {
  const response = record(record(error).response);
  const apiError = record(record(response.data).error);
  const reasons = Array.isArray(apiError.errors)
    ? apiError.errors.map((item) => record(item).reason)
    : [];
  if (
    response.status === 429 ||
    reasons.some(
      (reason) =>
        reason === 'quotaExceeded' ||
        reason === 'dailyLimitExceeded' ||
        reason === 'rateLimitExceeded',
    )
  ) {
    return new YoutubePublicError('YouTube public API quota-limited');
  }
  if (response.status === 401 || response.status === 403) {
    return new YoutubePublicError('YouTube public API access-denied');
  }
  return new YoutubePublicError('YouTube public API unavailable');
}

interface PublicChannel {
  id: string;
  title?: string;
  uploads: string;
}

interface PublicPage {
  items: Record<string, unknown>[];
  nextPageToken?: string;
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function count(value: unknown): number | undefined {
  if (
    typeof value !== 'number' &&
    !(typeof value === 'string' && /^\d+$/.test(value))
  ) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function date(value: unknown): Date | undefined {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(value)
  ) {
    return undefined;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === value.slice(0, 19)
    ? parsed
    : undefined;
}

@Injectable()
export class YoutubePublicProvider implements SourceTimelineProvider {
  readonly name = 'app-api-key' as const;
  readonly platforms = [SocialSourcePlatform.YOUTUBE] as const;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async canCollect(
    platform: SocialSourcePlatform,
    _context: SourceCollectContext,
  ): Promise<boolean> {
    return (
      platform === SocialSourcePlatform.YOUTUBE &&
      Boolean(text(this.configService.get('YOUTUBE_API_KEY'))?.trim())
    );
  }

  async collectTimeline(
    platform: SocialSourcePlatform,
    handle: string,
    context: SourceCollectContext,
  ): Promise<SourceCollectResult> {
    const key = text(this.configService.get('YOUTUBE_API_KEY'))?.trim();
    if (!key || platform !== SocialSourcePlatform.YOUTUBE) {
      throw new Error('YouTube public provider is unavailable');
    }
    const input = handle.trim();
    const isChannelId = CHANNEL_ID.test(input);
    if (!isChannelId && !/^@?[\p{L}\p{N}_.-]{3,30}$/u.test(input)) {
      throw new Error(
        'YouTube public provider requires a channel ID or handle',
      );
    }
    const limit = Number.isFinite(context.limit)
      ? Math.min(500, Math.max(1, Math.floor(context.limit ?? 100)))
      : 100;
    try {
      const channels = await this.request('channels', key, {
        ...(isChannelId
          ? { id: input }
          : { forHandle: input.replace(/^@/, '') }),
        maxResults: 1,
        part: 'snippet,contentDetails',
      });
      const selected = channels.items[0];
      const id = text(selected?.id);
      const uploads = text(
        record(record(selected?.contentDetails).relatedPlaylists).uploads,
      );
      if (channels.items.length === 0)
        throw new YoutubePublicError('YouTube public API channel-not-found');
      if (
        channels.items.length !== 1 ||
        !id ||
        !CHANNEL_ID.test(id) ||
        !uploads ||
        (isChannelId && id !== input)
      ) {
        throw new YoutubePublicError('YouTube public API invalid-response');
      }
      const channel: PublicChannel = {
        id,
        title: text(record(selected?.snippet).title),
        uploads,
      };
      const posts = await this.collectUploads(
        key,
        channel,
        input,
        context,
        limit,
      );
      return { handle: input, platform, posts, provider: 'app-api-key' };
    } catch (error: unknown) {
      // Axios errors can include the API key and complete request configuration.
      if (error instanceof YoutubePublicError) throw error;
      throw apiFailure(error);
    }
  }

  private async request(
    endpoint: string,
    key: string,
    params: Record<string, string | number>,
  ): Promise<PublicPage> {
    const response = await firstValueFrom(
      this.httpService.get<unknown>(`${API_URL}/${endpoint}`, {
        params: { ...params, key },
        timeout: 15_000,
      }),
    );
    const data = record(response.data);
    if (
      !Array.isArray(data.items) ||
      data.items.length > PAGE_SIZE ||
      data.error ||
      data.items.some(
        (item) => !item || typeof item !== 'object' || Array.isArray(item),
      ) ||
      (data.nextPageToken !== undefined &&
        typeof data.nextPageToken !== 'string')
    ) {
      throw new YoutubePublicError('YouTube public API invalid-response');
    }
    return {
      items: data.items.map(record),
      nextPageToken: text(data.nextPageToken),
    };
  }

  private async collectUploads(
    key: string,
    channel: PublicChannel,
    handle: string,
    context: SourceCollectContext,
    limit: number,
  ): Promise<CollectedSourcePost[]> {
    const posts: CollectedSourcePost[] = [];
    const seenIds = new Set<string>();
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    for (
      let pageIndex = 0;
      pageIndex < MAX_PAGES && posts.length < limit;
      pageIndex++
    ) {
      const page = await this.request('playlistItems', key, {
        maxResults: PAGE_SIZE,
        ...(pageToken ? { pageToken } : {}),
        part: 'contentDetails',
        playlistId: channel.uploads,
      });
      const ids: string[] = [];
      let exhausted = false;
      for (const item of page.items) {
        const details = record(item.contentDetails);
        const id = text(details.videoId);
        if (id && id === context.sinceId) {
          exhausted = true;
          break;
        }
        const publishedAt = date(details.videoPublishedAt);
        if (context.since && publishedAt && publishedAt < context.since) {
          exhausted = true;
          break;
        }
        if (!id || !VIDEO_ID.test(id) || seenIds.has(id)) continue;
        seenIds.add(id);
        ids.push(id);
      }
      if (ids.length > 0) {
        const videos = await this.request('videos', key, {
          id: ids.join(','),
          part: 'snippet,statistics,status',
        });
        const byId = new Map(videos.items.map((item) => [text(item.id), item]));
        for (const id of ids) {
          const item = byId.get(id);
          if (!item) continue;
          const snippet = record(item.snippet);
          const status = record(item.status);
          if (
            ['deleted', 'failed', 'rejected'].includes(
              String(status.uploadStatus),
            )
          )
            continue;
          if (
            record(item.status).privacyStatus !== 'public' ||
            snippet.channelId !== channel.id
          )
            continue;
          const publishedAt = date(snippet.publishedAt);
          if (context.since && !publishedAt) continue;
          if (context.since && publishedAt && publishedAt < context.since) {
            exhausted = true;
            break;
          }
          const statistics = record(item.statistics);
          const title = text(snippet.title) ?? '';
          const description = text(snippet.description);
          const thumbnails = record(snippet.thumbnails);
          const thumbnailUrl = [
            'maxres',
            'standard',
            'high',
            'medium',
            'default',
          ]
            .map((size) => text(record(thumbnails[size]).url))
            .find(Boolean);
          posts.push({
            authorDisplayName: channel.title,
            authorId: channel.id,
            authorUsername: handle,
            contentType: 'video',
            contentUrl: `https://www.youtube.com/watch?v=${id}`,
            createdAt: publishedAt,
            id,
            mediaUrls: [],
            metrics: {
              comments: count(statistics.commentCount),
              likes: count(statistics.likeCount),
              views: count(statistics.viewCount),
            },
            platform: SocialSourcePlatform.YOUTUBE,
            text: description ? `${title}\n${description}` : title,
            thumbnailUrl,
          });
          if (posts.length >= limit) break;
        }
      }
      pageToken = page.nextPageToken;
      if (exhausted || !pageToken || seenTokens.has(pageToken)) break;
      seenTokens.add(pageToken);
    }
    return posts;
  }
}
