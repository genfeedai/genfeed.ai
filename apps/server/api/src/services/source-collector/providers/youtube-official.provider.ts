import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { YoutubeService } from '@api/services/integrations/youtube/services/youtube.service';
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

const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';
/** Data API caps playlistItems and videos at 50 per page. */
const PAGE_SIZE = 50;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const REQUEST_TIMEOUT_MS = 15_000;
const SHORT_MAX_SECONDS = 60;

interface YoutubeChannelsPage {
  items?: Array<{
    contentDetails?: { relatedPlaylists?: { uploads?: unknown } };
    id?: unknown;
    snippet?: { customUrl?: unknown; title?: unknown };
  }>;
}

interface YoutubePlaylistItemsPage {
  items?: Array<{
    contentDetails?: { videoId?: unknown; videoPublishedAt?: unknown };
    snippet?: { resourceId?: { videoId?: unknown } };
  }>;
  nextPageToken?: unknown;
}

interface YoutubeVideosPage {
  items?: Array<{
    contentDetails?: { duration?: unknown };
    id?: unknown;
    snippet?: {
      description?: unknown;
      publishedAt?: unknown;
      thumbnails?: Record<string, { url?: unknown } | undefined>;
      title?: unknown;
    };
    statistics?: {
      commentCount?: unknown;
      likeCount?: unknown;
      viewCount?: unknown;
    };
  }>;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readCount(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}

function parseIsoDurationSeconds(value: unknown): number | undefined {
  const text = readString(value);
  const match = text
    ? /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(text)
    : null;
  if (!match) {
    return undefined;
  }
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2] ?? 0) * 60 +
    Number(match[3] ?? 0)
  );
}

function pickThumbnail(
  thumbnails: Record<string, { url?: unknown } | undefined> | undefined,
): string | undefined {
  for (const key of ['maxres', 'standard', 'high', 'medium', 'default']) {
    const url = readString(thumbnails?.[key]?.url);
    if (url) return url;
  }
  return undefined;
}

/**
 * Official YouTube Data API provider for the brand's own channel.
 *
 * Reads the credential's channel uploads playlist and walks it newest-first
 * with page tokens, batching video statistics 50 at a time, until the limit
 * or the `since` window is reached. Own-account only: the uploads playlist is
 * the authenticated channel's, so a `credentialId` is required and public
 * channels are not served here.
 */
@Injectable()
export class YoutubeOfficialProvider implements SourceTimelineProvider {
  readonly name = 'brand-oauth' as const;
  readonly platforms = [SocialSourcePlatform.YOUTUBE] as const;

  constructor(
    private readonly httpService: HttpService,
    private readonly credentialsService: CredentialsService,
    private readonly youtubeService: YoutubeService,
  ) {}

  async canCollect(
    platform: SocialSourcePlatform,
    context: SourceCollectContext,
  ): Promise<boolean> {
    return (
      platform === SocialSourcePlatform.YOUTUBE &&
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
        'YouTube official provider requires organizationId, brandId and credentialId',
      );
    }
    const credential = await this.credentialsService.resolveBrandAccount({
      brandId: context.brandId,
      credentialId: context.credentialId,
      organizationId: context.organizationId,
      platform: CredentialPlatform.YOUTUBE,
    });
    if (!credential) {
      throw new Error('YouTube credential not found');
    }
    const accessToken = await this.resolveAccessToken(
      context.organizationId,
      context.brandId,
      credential,
    );
    const channel = await this.fetchChannel(accessToken, credential.externalId);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, context.limit ?? DEFAULT_LIMIT),
    );
    const posts = await this.paginateUploads(
      accessToken,
      channel,
      handle,
      limit,
      context,
    );

    return { handle, platform, posts, provider: 'brand-oauth' };
  }

  private async resolveAccessToken(
    organizationId: string,
    brandId: string,
    credential: { accessToken: string | null; id: string },
  ): Promise<string> {
    // Refresh the account being read, not the brand's default one — a brand
    // may hold several channels. Fall back to the stored token.
    try {
      const client = await this.youtubeService.refreshToken(
        organizationId,
        brandId,
        credential.id,
      );
      const refreshed = readString(client.credentials.access_token);
      if (refreshed) {
        return refreshed;
      }
    } catch {
      // Stored token below may still be valid.
    }
    if (!credential.accessToken) {
      throw new Error('YouTube credential is missing an access token');
    }
    return EncryptionUtil.decrypt(credential.accessToken);
  }

  private async fetchChannel(
    accessToken: string,
    externalId: string | null,
  ): Promise<{ id: string; title?: string; uploadsPlaylistId: string }> {
    const response = await firstValueFrom(
      this.httpService.get<YoutubeChannelsPage>(
        `${YOUTUBE_DATA_API}/channels`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            maxResults: 50,
            mine: true,
            part: 'snippet,contentDetails',
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const channels = Array.isArray(response.data?.items)
      ? response.data.items
      : [];
    const selected =
      channels.find((item) => readString(item.id) === externalId) ??
      (channels.length === 1 ? channels[0] : undefined);
    const id = readString(selected?.id);
    const uploadsPlaylistId = readString(
      selected?.contentDetails?.relatedPlaylists?.uploads,
    );
    if (!id || !uploadsPlaylistId) {
      throw new Error(
        channels.length > 1
          ? 'YouTube credential must select a channel before its history can be imported'
          : 'YouTube channel has no uploads playlist',
      );
    }
    return {
      id,
      title: readString(selected?.snippet?.title),
      uploadsPlaylistId,
    };
  }

  private async paginateUploads(
    accessToken: string,
    channel: { id: string; title?: string; uploadsPlaylistId: string },
    handle: string,
    limit: number,
    context: SourceCollectContext,
  ): Promise<CollectedSourcePost[]> {
    const collected: CollectedSourcePost[] = [];
    let pageToken: string | undefined;

    while (collected.length < limit) {
      const page = await firstValueFrom(
        this.httpService.get<YoutubePlaylistItemsPage>(
          `${YOUTUBE_DATA_API}/playlistItems`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              maxResults: PAGE_SIZE,
              ...(pageToken ? { pageToken } : {}),
              part: 'snippet,contentDetails',
              playlistId: channel.uploadsPlaylistId,
            },
            timeout: REQUEST_TIMEOUT_MS,
          },
        ),
      );
      const items = Array.isArray(page.data?.items) ? page.data.items : [];
      const videoIds = items
        .map(
          (item) =>
            readString(item.contentDetails?.videoId) ??
            readString(item.snippet?.resourceId?.videoId),
        )
        .filter((id): id is string => Boolean(id));
      if (videoIds.length === 0) {
        break;
      }

      const videos = await this.fetchVideos(accessToken, videoIds);
      let isWindowExhausted = false;
      for (const id of videoIds) {
        const post = videos.get(id);
        if (!post) continue;
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
        collected.push({
          ...post,
          authorId: channel.id,
          authorUsername: handle,
        });
        if (collected.length >= limit) break;
      }

      pageToken = readString(page.data?.nextPageToken);
      if (isWindowExhausted || !pageToken) {
        break;
      }
    }

    return collected.map((post) => ({
      ...post,
      authorDisplayName: channel.title,
    }));
  }

  private async fetchVideos(
    accessToken: string,
    videoIds: string[],
  ): Promise<Map<string, CollectedSourcePost>> {
    const response = await firstValueFrom(
      this.httpService.get<YoutubeVideosPage>(`${YOUTUBE_DATA_API}/videos`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          id: videoIds.join(','),
          part: 'id,snippet,contentDetails,statistics',
        },
        timeout: REQUEST_TIMEOUT_MS,
      }),
    );
    const videos = new Map<string, CollectedSourcePost>();
    for (const item of response.data?.items ?? []) {
      const id = readString(item.id);
      if (!id) continue;
      const durationSeconds = parseIsoDurationSeconds(
        item.contentDetails?.duration,
      );
      const publishedAt = readString(item.snippet?.publishedAt);
      const title = readString(item.snippet?.title) ?? '';
      const description = readString(item.snippet?.description);
      videos.set(id, {
        contentType:
          durationSeconds !== undefined && durationSeconds <= SHORT_MAX_SECONDS
            ? 'short'
            : 'video',
        contentUrl: `https://www.youtube.com/watch?v=${id}`,
        createdAt: publishedAt ? new Date(publishedAt) : undefined,
        id,
        mediaUrls: [`https://www.youtube.com/watch?v=${id}`],
        metrics: {
          comments: readCount(item.statistics?.commentCount),
          likes: readCount(item.statistics?.likeCount),
          views: readCount(item.statistics?.viewCount),
        },
        platform: SocialSourcePlatform.YOUTUBE,
        text: description ? `${title}\n${description}` : title,
        thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
      });
    }
    return videos;
  }
}
