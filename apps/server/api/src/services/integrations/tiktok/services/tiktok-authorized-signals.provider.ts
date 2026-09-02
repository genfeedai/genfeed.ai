import {
  type AuthorizedSignalsSettledResult,
  retryProviderRequest,
  settleProviderRequest,
} from '@api/services/integrations/_shared/authorized-signals-request.util';
import {
  getTikTokRetryAfterMs,
  isTikTokAuthorizationError,
  isTikTokRateLimitError,
  isTikTokScopeError,
} from '@api/services/integrations/tiktok/utils/tiktok-error.util';
import type { TikTokOwnedVideoSignal } from '@api-types/contracts/tiktok-authorized-signals.contract';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

const TIKTOK_SIGNAL_MAX_ATTEMPTS = 2;
const TIKTOK_SIGNAL_RETRY_FALLBACK_MS = 1_000;
const TIKTOK_SIGNAL_RETRY_MAX_MS = 5_000;
const TIKTOK_SIGNAL_REQUEST_TIMEOUT_MS = 10_000;
const TIKTOK_VIDEO_LIMIT = 20;

const USER_INFO_PROVIDER_FIELDS_BY_SCOPE = {
  'user.info.basic': ['avatar_url', 'display_name'],
  'user.info.profile': [
    'bio_description',
    'is_verified',
    'profile_deep_link',
    'username',
  ],
  'user.info.stats': [
    'follower_count',
    'following_count',
    'likes_count',
    'video_count',
  ],
} as const;

const VIDEO_PROVIDER_FIELDS = [
  'id',
  'create_time',
  'share_url',
  'video_description',
  'duration',
  'title',
  'like_count',
  'comment_count',
  'share_count',
  'view_count',
].join(',');

interface TikTokUserInfoResponse {
  data?: { user?: Record<string, unknown> };
}

interface TikTokVideoListResponse {
  data?: {
    cursor?: unknown;
    has_more?: unknown;
    videos?: Array<{
      comment_count?: unknown;
      create_time?: unknown;
      duration?: unknown;
      id?: unknown;
      like_count?: unknown;
      share_count?: unknown;
      share_url?: unknown;
      title?: unknown;
      video_description?: unknown;
      view_count?: unknown;
    }>;
  };
}

interface TikTokCreatorInfoResponse {
  data?: Record<string, unknown>;
}

export interface TikTokVideosFetch {
  hasMore: boolean;
  rawVideoCount: number;
  videos: TikTokOwnedVideoSignal[];
}

export interface TikTokProviderFetchResult {
  creatorInfoResult: AuthorizedSignalsSettledResult<Record<string, unknown>>;
  userInfoResult: AuthorizedSignalsSettledResult<Record<string, unknown>>;
  videosResult: AuthorizedSignalsSettledResult<TikTokVideosFetch>;
}

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function readHttpUrl(value: unknown): string | undefined {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }

  try {
    const url = new URL(candidate);
    return ['http:', 'https:'].includes(url.protocol) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

export function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

export function readStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

/**
 * Owns TikTok authorized-signal provider I/O and raw response mapping. This
 * stays platform-specific because TikTok's split user/video/creator endpoints,
 * scope-to-field projection, and error vocabulary do not form a stable shared
 * provider contract with Graph or X.
 */
export class TiktokAuthorizedSignalsProvider {
  constructor(
    private readonly httpService: HttpService,
    private readonly endpoint: string,
    private readonly contentType: string,
  ) {}

  async fetch(
    accessToken: string,
    grantedScopes: string[],
    scopes: {
      user: readonly string[];
      videoList: string;
      videoPublish: string;
    },
  ): Promise<TikTokProviderFetchResult> {
    const userInfoPromise = grantedScopes.some((scope) =>
      scopes.user.includes(scope),
    )
      ? this.requestWithRetry(() =>
          this.fetchUserInfo(accessToken, grantedScopes),
        )
      : undefined;
    const videosPromise = grantedScopes.includes(scopes.videoList)
      ? this.requestWithRetry(() => this.fetchVideos(accessToken))
      : undefined;
    const creatorInfoPromise = grantedScopes.includes(scopes.videoPublish)
      ? this.requestWithRetry(() => this.fetchCreatorInfo(accessToken))
      : undefined;

    const [userInfoResult, videosResult, creatorInfoResult] = await Promise.all(
      [
        this.settle(userInfoPromise),
        this.settle(videosPromise),
        this.settle(creatorInfoPromise),
      ],
    );

    return { creatorInfoResult, userInfoResult, videosResult };
  }

  findAuthorizationError(result: TikTokProviderFetchResult): unknown {
    return [
      result.userInfoResult.error,
      result.videosResult.error,
      result.creatorInfoResult.error,
    ]
      .filter((error) => error !== undefined)
      .find(
        (error) =>
          !isTikTokScopeError(error) && isTikTokAuthorizationError(error),
      );
  }

  private async fetchUserInfo(
    accessToken: string,
    grantedScopes: string[],
  ): Promise<Record<string, unknown>> {
    const fields = Object.entries(USER_INFO_PROVIDER_FIELDS_BY_SCOPE)
      .filter(([scope]) => grantedScopes.includes(scope))
      .flatMap(([, scopeFields]) => scopeFields)
      .join(',');
    const response = await firstValueFrom(
      this.httpService.get<TikTokUserInfoResponse>(
        `${this.endpoint}/user/info/`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': this.contentType,
          },
          params: { fields },
          timeout: TIKTOK_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );

    return readRecord(response.data?.data?.user);
  }

  private async fetchVideos(accessToken: string): Promise<TikTokVideosFetch> {
    const response = await firstValueFrom(
      this.httpService.post<TikTokVideoListResponse>(
        `${this.endpoint}/video/list/?fields=${VIDEO_PROVIDER_FIELDS}`,
        { max_count: TIKTOK_VIDEO_LIMIT },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': this.contentType,
          },
          timeout: TIKTOK_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const rawVideos = Array.isArray(response.data?.data?.videos)
      ? response.data.data.videos
      : [];

    return {
      hasMore: response.data?.data?.has_more === true,
      rawVideoCount: rawVideos.length,
      videos: rawVideos.flatMap((video) => {
        const id = readString(video.id);
        if (!id) {
          return [];
        }

        return [
          {
            commentCount: readNonNegativeInteger(video.comment_count),
            createTime: readNonNegativeInteger(video.create_time),
            duration: readNonNegativeInteger(video.duration),
            id,
            likeCount: readNonNegativeInteger(video.like_count),
            shareCount: readNonNegativeInteger(video.share_count),
            shareUrl: readHttpUrl(video.share_url),
            title: readString(video.title),
            videoDescription: readString(video.video_description),
            viewCount: readNonNegativeInteger(video.view_count),
          },
        ];
      }),
    };
  }

  private async fetchCreatorInfo(
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const response = await firstValueFrom(
      this.httpService.post<TikTokCreatorInfoResponse>(
        `${this.endpoint}/post/publish/creator_info/query/`,
        {},
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': this.contentType,
          },
          timeout: TIKTOK_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );

    return readRecord(response.data?.data);
  }

  private async requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
    return retryProviderRequest(request, {
      getDelayMs: (error, attempt) =>
        getTikTokRetryAfterMs(
          error,
          TIKTOK_SIGNAL_RETRY_FALLBACK_MS * 2 ** attempt,
          TIKTOK_SIGNAL_RETRY_MAX_MS,
        ),
      isRetryable: isTikTokRateLimitError,
      maxAttempts: TIKTOK_SIGNAL_MAX_ATTEMPTS,
    });
  }

  private async settle<T>(
    promise: Promise<T> | undefined,
  ): Promise<AuthorizedSignalsSettledResult<T>> {
    return settleProviderRequest(promise);
  }
}
