import {
  type AuthorizedSignalsSettledResult,
  retryProviderRequest,
  settleProviderRequest,
} from '@api/services/integrations/_shared/authorized-signals-request.util';
import type {
  InstagramMediaPerformanceSignal,
  InstagramOwnedMediaSignal,
} from '@api-types/contracts/instagram-authorized-signals.contract';
import { HttpService } from '@nestjs/axios';
import {
  getInstagramRetryAfterMs,
  isInstagramAuthorizationError,
  isInstagramProfessionalAccountError,
  isInstagramRateLimitError,
  isInstagramScopeError,
} from '@server/services/integrations/instagram/utils/instagram-error.util';
import { firstValueFrom } from 'rxjs';

const INSTAGRAM_SIGNAL_MAX_ATTEMPTS = 2;
const INSTAGRAM_SIGNAL_RETRY_FALLBACK_MS = 1_000;
const INSTAGRAM_SIGNAL_RETRY_MAX_MS = 5_000;
const INSTAGRAM_SIGNAL_REQUEST_TIMEOUT_MS = 10_000;
const INSTAGRAM_MEDIA_LIMIT = 20;

const PAGES_SCOPE = 'pages_show_list';
const PROFILE_PROVIDER_FIELDS =
  'id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count,account_type';
const MEDIA_PROVIDER_FIELDS =
  'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count,shortcode';
const MEDIA_INSIGHTS_FIELDS = `${MEDIA_PROVIDER_FIELDS},insights.metric(impressions,reach,saved,shares,total_interactions)`;

export interface InstagramUserResponse {
  account_type?: unknown;
  biography?: unknown;
  followers_count?: unknown;
  follows_count?: unknown;
  id?: unknown;
  media_count?: unknown;
  name?: unknown;
  profile_picture_url?: unknown;
  username?: unknown;
  website?: unknown;
}

interface InstagramMediaNode {
  caption?: unknown;
  comments_count?: unknown;
  id?: unknown;
  insights?: {
    data?: Array<{ name?: unknown; values?: Array<{ value?: unknown }> }>;
  };
  like_count?: unknown;
  media_product_type?: unknown;
  media_type?: unknown;
  permalink?: unknown;
  shortcode?: unknown;
  timestamp?: unknown;
}

interface InstagramMediaListResponse {
  data?: InstagramMediaNode[];
  paging?: { next?: unknown };
}

interface InstagramPagesResponse {
  data?: Array<{
    instagram_business_account?: InstagramUserResponse;
  }>;
}

export interface InstagramMediaFetch {
  hasMore: boolean;
  media: InstagramOwnedMediaSignal[];
  performance: InstagramMediaPerformanceSignal[];
  rawMediaCount: number;
}

export interface InstagramProviderFetchResult {
  mediaResult: SettledResult<InstagramMediaFetch>;
  profileResult: SettledResult<InstagramUserResponse>;
}

export type SettledResult<T> = AuthorizedSignalsSettledResult<T>;

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

export function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

export function readIsoToUnixSeconds(value: unknown): number | undefined {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }

  const parsed = Date.parse(candidate);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }

  return Math.max(0, Math.floor(parsed / 1000));
}

function insightValue(
  node: InstagramMediaNode,
  metric: string,
): number | undefined {
  const insights = Array.isArray(node.insights?.data) ? node.insights.data : [];
  const match = insights.find((item) => item.name === metric);
  return readNonNegativeInteger(match?.values?.[0]?.value);
}

/**
 * Owns provider I/O and response mapping; evidence policy stays in the
 * orchestrator. This remains platform-specific by design: Graph account
 * discovery, professional-account errors, insight fallback, and scopes do not
 * share the TikTok or X provider contract, so a common base would encode
 * platform branches instead of a stable abstraction.
 */
export class InstagramAuthorizedSignalsProvider {
  constructor(
    private readonly httpService: HttpService,
    private readonly graphUrl: string,
    private readonly apiVersion: string,
  ) {}

  async fetch(
    accessToken: string,
    igUserId: string | undefined,
    grantedScopes: string[],
    basicScope: string,
    insightsScope: string,
  ): Promise<InstagramProviderFetchResult> {
    const profilePromise = grantedScopes.includes(basicScope)
      ? this.requestWithRetry(() =>
          this.fetchProfile(accessToken, igUserId, grantedScopes),
        )
      : undefined;
    const mediaPromise = grantedScopes.includes(basicScope)
      ? this.requestWithRetry(() =>
          this.fetchMedia(
            accessToken,
            igUserId,
            grantedScopes.includes(insightsScope),
          ),
        )
      : undefined;
    const mediaWithFallbackPromise = mediaPromise
      ? mediaResultOrRetry(mediaPromise, () =>
          this.requestWithRetry(() =>
            this.fetchMedia(accessToken, igUserId, false),
          ),
        )
      : undefined;

    const [profileResult, mediaResult] = await Promise.all([
      this.settle(profilePromise),
      this.settle(mediaWithFallbackPromise),
    ]);

    return { mediaResult, profileResult };
  }

  findAuthorizationError(result: InstagramProviderFetchResult): unknown {
    return [result.profileResult.error, result.mediaResult.error]
      .filter((error) => error !== undefined)
      .find(
        (error) =>
          !isInstagramScopeError(error) &&
          !isInstagramProfessionalAccountError(error) &&
          isInstagramAuthorizationError(error),
      );
  }

  private async fetchProfile(
    accessToken: string,
    igUserId: string | undefined,
    grantedScopes: string[],
  ): Promise<InstagramUserResponse> {
    const resolvedId = igUserId
      ? igUserId
      : await this.resolveIgUserId(accessToken, grantedScopes);
    const response = await firstValueFrom(
      this.httpService.get<InstagramUserResponse>(
        `${this.graphUrl}/${this.apiVersion}/${resolvedId}`,
        {
          params: {
            access_token: accessToken,
            fields: PROFILE_PROVIDER_FIELDS,
          },
          timeout: INSTAGRAM_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );

    return response.data ?? {};
  }

  private async resolveIgUserId(
    accessToken: string,
    grantedScopes: string[],
  ): Promise<string> {
    if (!grantedScopes.includes(PAGES_SCOPE)) {
      throw {
        response: {
          data: {
            error: { code: 10, message: 'Missing pages_show_list permission' },
          },
          status: 403,
        },
      };
    }

    const response = await firstValueFrom(
      this.httpService.get<InstagramPagesResponse>(
        `${this.graphUrl}/${this.apiVersion}/me/accounts`,
        {
          params: {
            access_token: accessToken,
            fields:
              'id,instagram_business_account{id,username,name,account_type}',
          },
          timeout: INSTAGRAM_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const pages = Array.isArray(response.data?.data) ? response.data.data : [];
    const igUserId = pages
      .map((page) => readString(page.instagram_business_account?.id))
      .find((id): id is string => Boolean(id));

    if (!igUserId) {
      throw {
        response: {
          data: {
            error: {
              code: 10,
              message:
                'The Instagram account must be a professional account linked to a Facebook Page',
            },
          },
          status: 400,
        },
      };
    }

    return igUserId;
  }

  private async fetchMedia(
    accessToken: string,
    igUserId: string | undefined,
    includeInsights: boolean,
  ): Promise<InstagramMediaFetch> {
    if (!igUserId) {
      throw {
        response: {
          data: {
            error: {
              code: 10,
              message: 'Missing Instagram professional account id',
            },
          },
          status: 400,
        },
      };
    }

    const response = await firstValueFrom(
      this.httpService.get<InstagramMediaListResponse>(
        `${this.graphUrl}/${this.apiVersion}/${igUserId}/media`,
        {
          params: {
            access_token: accessToken,
            fields: includeInsights
              ? MEDIA_INSIGHTS_FIELDS
              : MEDIA_PROVIDER_FIELDS,
            limit: INSTAGRAM_MEDIA_LIMIT,
          },
          timeout: INSTAGRAM_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const rawMedia = Array.isArray(response.data?.data)
      ? response.data.data
      : [];

    return {
      hasMore: typeof response.data?.paging?.next === 'string',
      media: rawMedia.flatMap((node) => {
        const mapped = this.mapOwnedMedia(node);
        return mapped ? [mapped] : [];
      }),
      performance: rawMedia.flatMap((node) => {
        const mapped = this.mapMediaPerformance(node);
        return mapped ? [mapped] : [];
      }),
      rawMediaCount: rawMedia.length,
    };
  }

  private mapOwnedMedia(
    node: InstagramMediaNode,
  ): InstagramOwnedMediaSignal | undefined {
    const id = readString(node.id);
    if (!id) {
      return undefined;
    }

    return {
      caption: readString(node.caption),
      commentCount: readNonNegativeInteger(node.comments_count),
      createTime: readIsoToUnixSeconds(node.timestamp),
      id,
      likeCount: readNonNegativeInteger(node.like_count),
      mediaProductType: readString(node.media_product_type),
      mediaType: readString(node.media_type),
      permalink: readHttpUrl(node.permalink),
      shortcode: readString(node.shortcode),
    };
  }

  private mapMediaPerformance(
    node: InstagramMediaNode,
  ): InstagramMediaPerformanceSignal | undefined {
    const id = readString(node.id);
    if (!id) {
      return undefined;
    }

    return {
      commentCount: readNonNegativeInteger(node.comments_count),
      id,
      impressions: insightValue(node, 'impressions'),
      likeCount: readNonNegativeInteger(node.like_count),
      reach: insightValue(node, 'reach'),
      saved: insightValue(node, 'saved'),
      shares: insightValue(node, 'shares'),
      totalInteractions: insightValue(node, 'total_interactions'),
    };
  }

  private async requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
    return retryProviderRequest(request, {
      getDelayMs: (error, attempt) =>
        getInstagramRetryAfterMs(
          error,
          INSTAGRAM_SIGNAL_RETRY_FALLBACK_MS * 2 ** attempt,
          INSTAGRAM_SIGNAL_RETRY_MAX_MS,
        ),
      isRetryable: isInstagramRateLimitError,
      maxAttempts: INSTAGRAM_SIGNAL_MAX_ATTEMPTS,
    });
  }

  private async settle<T>(
    promise: Promise<T> | undefined,
  ): Promise<SettledResult<T>> {
    return settleProviderRequest(promise);
  }
}

async function mediaResultOrRetry<T>(
  promise: Promise<T>,
  retryWithoutInsights: () => Promise<T>,
): Promise<T> {
  try {
    return await promise;
  } catch (error: unknown) {
    if (
      isInstagramAuthorizationError(error) ||
      isInstagramRateLimitError(error)
    ) {
      throw error;
    }

    try {
      return await retryWithoutInsights();
    } catch {
      throw error;
    }
  }
}
