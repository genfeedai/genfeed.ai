import { SocialWarmupEnrollmentsService } from '@api/collections/social-warmup-enrollments/services/social-warmup-enrollments.service';
import {
  retryProviderRequest,
  settleProviderRequest,
} from '@api/services/integrations/_shared/authorized-signals-request.util';
import {
  getYoutubeRetryAfterMs,
  isYoutubeAuthorizationError,
  isYoutubeChannelSelectionError,
  isYoutubeRateLimitError,
  isYoutubeScopeError,
  parseYoutubeGrantedScopes,
} from '@api/services/integrations/youtube/utils/youtube-error.util';
import {
  type YoutubeAuthorizedSignalEvidence,
  type YoutubeAuthorizedSignalReason,
  type YoutubeAuthorizedSignalsSnapshot,
  type YoutubeOwnedUploadSignal,
  type YoutubeOwnedVideoAnalyticsSignal,
  youtubeAuthorizedSignalStatusValues,
  youtubeAuthorizedSignalsSnapshotSchema,
} from '@api-types/contracts/youtube-authorized-signals.contract';
import { CredentialPlatform, TargetExecutionState } from '@genfeedai/enums';
import { scopedWhere } from '@genfeedai/server';
import { LoggerService } from '@libs/logger/logger.service';
import { EncryptionUtil } from '@libs/utils/encryption/encryption.util';
import { HttpService } from '@nestjs/axios';
import { HttpException, Injectable } from '@nestjs/common';
import type { CredentialDocument } from '@server/collections/credentials/schemas/credential.schema';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import {
  CACHE_PATTERNS,
  CACHE_TAGS,
  SCOPED_CACHE_TAGS,
} from '@server/common/constants/cache-patterns.constants';
import { NotFoundException } from '@server/exceptions/not-found.exception';
import { CacheService } from '@server/services/cache/cache.service';
import { YoutubeAuthService } from '@server/services/integrations/youtube/services/modules/youtube-auth.service';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { firstValueFrom } from 'rxjs';

const YOUTUBE_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS = 5 * 60;
const YOUTUBE_STALE_SIGNALS_CACHE_TTL_SECONDS = 60;
const YOUTUBE_AUTHORIZED_SIGNALS_STORAGE_KEY = 'youtubeAuthorized';
const YOUTUBE_AUTHORIZATION_STORAGE_KEY = 'youtubeAuthorization';
const YOUTUBE_SIGNAL_MAX_ATTEMPTS = 2;
const YOUTUBE_SIGNAL_RETRY_FALLBACK_MS = 1_000;
const YOUTUBE_SIGNAL_RETRY_MAX_MS = 5_000;
const YOUTUBE_SIGNAL_REQUEST_TIMEOUT_MS = 10_000;
const YOUTUBE_VIDEO_LIMIT = 20;
const YOUTUBE_DATA_API = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_ANALYTICS_API = 'https://youtubeanalytics.googleapis.com/v2';

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube';
export const YOUTUBE_READONLY_SCOPE =
  'https://www.googleapis.com/auth/youtube.readonly';
export const YOUTUBE_UPLOAD_SCOPE =
  'https://www.googleapis.com/auth/youtube.upload';
export const YT_ANALYTICS_READONLY_SCOPE =
  'https://www.googleapis.com/auth/yt-analytics.readonly';

const CHANNEL_FIELDS = [
  'customUrl',
  'description',
  'hiddenSubscriberCount',
  'id',
  'publishedAt',
  'subscriberCount',
  'thumbnailUrl',
  'title',
  'videoCount',
  'viewCount',
] as const;

const UPLOAD_FIELDS = [
  'commentCount',
  'createTime',
  'durationSeconds',
  'id',
  'likeCount',
  'mediaType',
  'publishedAt',
  'title',
  'viewCount',
] as const;

const PUBLISHING_FIELDS = [
  'canPublish',
  'channelId',
  'isLinked',
  'longUploadsStatus',
  'privacyStatus',
] as const;

const ANALYTICS_FIELDS = [
  'averageViewDurationSeconds',
  'averageViewPercentage',
  'id',
  'impressions',
  'impressionsClickThroughRate',
  'views',
] as const;

const AGE_FIELDS = ['createdAt', 'createTime'] as const;

type YoutubeSignalFieldStatus =
  (typeof youtubeAuthorizedSignalStatusValues)[number];

function toFieldAvailability(
  entries: ReadonlyArray<readonly [string, YoutubeSignalFieldStatus]>,
): Record<string, YoutubeSignalFieldStatus> {
  return Object.fromEntries(entries);
}

interface YoutubeChannelNode {
  brandingSettings?: { channel?: { title?: unknown }; image?: unknown };
  contentDetails?: { relatedPlaylists?: { uploads?: unknown } };
  id?: unknown;
  snippet?: {
    customUrl?: unknown;
    description?: unknown;
    publishedAt?: unknown;
    thumbnails?: { high?: { url?: unknown }; default?: { url?: unknown } };
    title?: unknown;
  };
  statistics?: {
    hiddenSubscriberCount?: unknown;
    subscriberCount?: unknown;
    videoCount?: unknown;
    viewCount?: unknown;
  };
  status?: {
    isLinked?: unknown;
    longUploadsStatus?: unknown;
    privacyStatus?: unknown;
  };
}

interface YoutubeChannelListResponse {
  items?: YoutubeChannelNode[];
}

interface YoutubePlaylistItemsResponse {
  items?: Array<{
    contentDetails?: { videoId?: unknown; videoPublishedAt?: unknown };
    snippet?: {
      publishedAt?: unknown;
      resourceId?: { videoId?: unknown };
      title?: unknown;
    };
  }>;
  nextPageToken?: unknown;
}

interface YoutubeVideosResponse {
  items?: Array<{
    contentDetails?: { duration?: unknown };
    id?: unknown;
    snippet?: { publishedAt?: unknown; title?: unknown };
    statistics?: {
      commentCount?: unknown;
      likeCount?: unknown;
      viewCount?: unknown;
    };
  }>;
}

interface YoutubeAnalyticsResponse {
  columnHeaders?: Array<{ name?: unknown }>;
  rows?: unknown[][];
}

export interface RefreshYoutubeAuthorizedSignalsParams {
  /**
   * Raw (plaintext) OAuth access token from a just-completed token exchange.
   * Used verbatim — never decrypted — so callers must not pass the encrypted
   * persisted credential token here; omit it to use the stored credential.
   */
  accessToken?: string;
  credentialId: string;
  force?: boolean;
  grantedScopes?: readonly string[] | string;
  organizationId: string;
}

type PlatformEvidenceKey = Exclude<
  YoutubeAuthorizedSignalEvidence['key'],
  'genfeed-publish-outcomes-observed'
>;

type GenfeedPublishOutcome =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'paused'
  | 'cancelled'
  | 'skipped';

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function readHttpUrl(value: unknown): string | undefined {
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

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

function readIsoTimestamp(value: unknown): string | undefined {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function readIsoToUnixSeconds(value: unknown): number | undefined {
  const iso = readIsoTimestamp(value);
  if (!iso) {
    return undefined;
  }

  const seconds = Math.floor(Date.parse(iso) / 1000);
  return seconds > 0 ? seconds : undefined;
}

function parseIsoDurationSeconds(value: unknown): number | undefined {
  const duration = readString(value);
  if (!duration) {
    return undefined;
  }

  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return undefined;
  }

  const hours = Number.parseInt(match[1] || '0', 10);
  const minutes = Number.parseInt(match[2] || '0', 10);
  const seconds = Number.parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function mapOutcome(value: unknown): GenfeedPublishOutcome | undefined {
  const outcomes = new Set<string>([
    TargetExecutionState.SCHEDULED,
    TargetExecutionState.PUBLISHING,
    TargetExecutionState.PUBLISHED,
    TargetExecutionState.FAILED,
    TargetExecutionState.PAUSED,
    TargetExecutionState.CANCELLED,
    TargetExecutionState.SKIPPED,
  ]);

  return typeof value === 'string' && outcomes.has(value)
    ? (value as GenfeedPublishOutcome)
    : undefined;
}

function hasYoutubeDataScope(grantedScopes: string[]): boolean {
  return (
    grantedScopes.includes(YOUTUBE_SCOPE) ||
    grantedScopes.includes(YOUTUBE_READONLY_SCOPE)
  );
}

function hasYoutubePublishScope(grantedScopes: string[]): boolean {
  return (
    grantedScopes.includes(YOUTUBE_SCOPE) ||
    grantedScopes.includes(YOUTUBE_UPLOAD_SCOPE)
  );
}

function dataRequiredScopes(grantedScopes: string[]): string[] {
  if (grantedScopes.includes(YOUTUBE_SCOPE)) {
    return [YOUTUBE_SCOPE];
  }
  if (grantedScopes.includes(YOUTUBE_READONLY_SCOPE)) {
    return [YOUTUBE_READONLY_SCOPE];
  }
  return [YOUTUBE_READONLY_SCOPE];
}

function publishRequiredScopes(grantedScopes: string[]): string[] {
  if (grantedScopes.includes(YOUTUBE_SCOPE)) {
    return [YOUTUBE_SCOPE];
  }
  if (grantedScopes.includes(YOUTUBE_UPLOAD_SCOPE)) {
    return [YOUTUBE_UPLOAD_SCOPE];
  }
  return [YOUTUBE_UPLOAD_SCOPE];
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

@Injectable()
export class YoutubeAuthorizedSignalsService {
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly cacheService: CacheService,
    private readonly credentialsService: CredentialsService,
    private readonly httpService: HttpService,
    private readonly loggerService: LoggerService,
    private readonly prisma: PrismaService,
    private readonly socialWarmupEnrollmentsService: SocialWarmupEnrollmentsService,
    private readonly youtubeAuthService: YoutubeAuthService,
  ) {}

  async refresh(
    params: RefreshYoutubeAuthorizedSignalsParams,
  ): Promise<YoutubeAuthorizedSignalsSnapshot> {
    const credential = await this.credentialsService.findOne({
      id: params.credentialId,
      organizationId: params.organizationId,
      platform: CredentialPlatform.YOUTUBE,
    });

    if (!credential) {
      throw new NotFoundException('YouTube credential');
    }

    const previousSnapshot = this.readStoredSnapshot(credential);
    const cacheKey = CACHE_PATTERNS.YOUTUBE_AUTHORIZED_SIGNALS_SINGLE(
      credential.id,
    );

    if (!params.force) {
      const cached = await this.cacheService.get<unknown>(cacheKey);
      const cachedSnapshot =
        youtubeAuthorizedSignalsSnapshotSchema.safeParse(cached);
      if (cachedSnapshot.success) {
        return cachedSnapshot.data;
      }
    }

    const refreshAttemptedAt = new Date().toISOString();
    const grantedScopes = this.resolveGrantedScopes(
      params.grantedScopes,
      credential,
      previousSnapshot,
    );
    const genfeedEvidence = await this.buildGenfeedEvidence(
      credential,
      params.organizationId,
      refreshAttemptedAt,
    );

    if (!credential.isConnected && !params.accessToken) {
      return await this.persistSnapshot(
        credential,
        params.organizationId,
        cacheKey,
        this.buildRevokedSnapshot(
          credential.id,
          grantedScopes,
          previousSnapshot,
          genfeedEvidence,
          refreshAttemptedAt,
        ),
      );
    }

    let accessToken: string;
    try {
      accessToken = await this.resolveAccessToken(params, credential);
    } catch (error: unknown) {
      if (this.isAuthorizationFailure(error)) {
        return await this.persistSnapshot(
          credential,
          params.organizationId,
          cacheKey,
          this.buildRevokedSnapshot(
            credential.id,
            grantedScopes,
            previousSnapshot,
            genfeedEvidence,
            refreshAttemptedAt,
          ),
        );
      }
      throw error;
    }

    const channelResult = hasYoutubeDataScope(grantedScopes)
      ? await this.settle(() => this.fetchChannels(accessToken))
      : { error: undefined, value: undefined };

    if (
      channelResult.error &&
      this.isAuthorizationFailure(channelResult.error)
    ) {
      return await this.persistSnapshot(
        credential,
        params.organizationId,
        cacheKey,
        this.buildRevokedSnapshot(
          credential.id,
          grantedScopes,
          previousSnapshot,
          genfeedEvidence,
          refreshAttemptedAt,
        ),
      );
    }

    let selected: {
      channel?: YoutubeChannelNode;
      reason?: YoutubeAuthorizedSignalReason;
    };
    if (!hasYoutubeDataScope(grantedScopes)) {
      selected = { reason: 'missing_scope' };
    } else if (channelResult.error) {
      selected = {};
    } else {
      selected = this.selectChannel(
        channelResult.value?.channels ?? [],
        credential.externalId,
      );
    }
    if (
      !selected.channel &&
      isYoutubeChannelSelectionError(channelResult.error)
    ) {
      selected.reason = 'channel_selection_required';
    }
    const channelEvidence = this.buildChannelEvidence(
      grantedScopes,
      channelResult,
      selected,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const nativeAgeEvidence = this.buildNativeAccountAgeEvidence(
      channelEvidence,
      grantedScopes,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const publishingEvidence = this.buildPublishingCapabilityEvidence(
      grantedScopes,
      selected.channel,
      selected.reason,
      channelResult.error,
      previousSnapshot,
      refreshAttemptedAt,
    );

    const uploadsPlaylistId = readString(
      selected.channel?.contentDetails?.relatedPlaylists?.uploads,
    );
    const shouldFetchUploads =
      hasYoutubeDataScope(grantedScopes) &&
      selected.reason === undefined &&
      Boolean(uploadsPlaylistId);

    const uploadsResult = shouldFetchUploads
      ? await this.settle(() =>
          this.fetchOwnedUploads(accessToken, uploadsPlaylistId ?? ''),
        )
      : {
          error: selected.reason ? undefined : channelResult.error,
          value: undefined,
        };

    const ownedUploadsEvidence = this.buildOwnedUploadsEvidence(
      grantedScopes,
      uploadsResult,
      selected.reason,
      previousSnapshot,
      refreshAttemptedAt,
    );
    const firstUploadEvidence = this.buildFirstUploadEvidence(
      ownedUploadsEvidence,
      refreshAttemptedAt,
    );

    const videoIds =
      ownedUploadsEvidence.key === 'owned-uploads-snapshot'
        ? (ownedUploadsEvidence.value?.videos ?? []).map((video) => video.id)
        : [];
    const analyticsResult =
      grantedScopes.includes(YT_ANALYTICS_READONLY_SCOPE) &&
      selected.reason === undefined &&
      readString(selected.channel?.id)
        ? await this.settle(() =>
            this.fetchAnalytics(
              accessToken,
              readString(selected.channel?.id) ?? '',
              videoIds,
            ),
          )
        : { error: undefined, value: undefined };

    const analyticsEvidence = this.buildAnalyticsEvidence(
      grantedScopes,
      analyticsResult,
      selected.reason,
      ownedUploadsEvidence,
      previousSnapshot,
      refreshAttemptedAt,
    );

    const evidence: YoutubeAuthorizedSignalEvidence[] = [
      channelEvidence,
      ownedUploadsEvidence,
      publishingEvidence,
      analyticsEvidence,
      firstUploadEvidence,
      nativeAgeEvidence,
      genfeedEvidence,
    ];
    const snapshot = youtubeAuthorizedSignalsSnapshotSchema.parse({
      credentialId: credential.id,
      evidence,
      grantedScopes,
      platform: CredentialPlatform.YOUTUBE,
      refreshAttemptedAt,
      state: this.resolveSnapshotState(evidence),
    });

    return await this.persistSnapshot(
      credential,
      params.organizationId,
      cacheKey,
      snapshot,
    );
  }

  private async resolveAccessToken(
    params: RefreshYoutubeAuthorizedSignalsParams,
    credential: CredentialDocument,
  ): Promise<string> {
    if (params.accessToken) {
      return params.accessToken;
    }

    if (credential.brandId) {
      // Refresh the account whose signals are being read, not the brand's
      // default one — a brand may hold several YouTube channels.
      const oauthClient = await this.youtubeAuthService.refreshToken(
        params.organizationId,
        credential.brandId,
        credential.id,
      );
      const refreshed = readString(oauthClient.credentials.access_token);
      if (refreshed) {
        return refreshed;
      }
    }

    const storedToken = credential.accessToken;
    if (!storedToken) {
      throw new Error('YouTube credential is missing an access token');
    }
    return EncryptionUtil.decrypt(storedToken);
  }

  private async fetchChannels(
    accessToken: string,
  ): Promise<{ channels: YoutubeChannelNode[] }> {
    const response = await firstValueFrom(
      this.httpService.get<YoutubeChannelListResponse>(
        `${YOUTUBE_DATA_API}/channels`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            maxResults: 50,
            mine: true,
            part: 'snippet,statistics,brandingSettings,contentDetails,status',
          },
          timeout: YOUTUBE_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );

    return {
      channels: Array.isArray(response.data?.items) ? response.data.items : [],
    };
  }

  private selectChannel(
    channels: YoutubeChannelNode[],
    externalId: string | null | undefined,
  ): {
    channel?: YoutubeChannelNode;
    reason?: YoutubeAuthorizedSignalReason;
  } {
    if (channels.length === 0) {
      return { reason: 'empty_response' };
    }

    const selectedId = readString(externalId);
    if (selectedId) {
      const matched = channels.find(
        (channel) => readString(channel.id) === selectedId,
      );
      if (matched) {
        return { channel: matched };
      }
      return { reason: 'channel_selection_required' };
    }

    if (channels.length > 1) {
      return { reason: 'channel_selection_required' };
    }

    return { channel: channels[0] };
  }

  private async fetchOwnedUploads(
    accessToken: string,
    uploadsPlaylistId: string,
  ): Promise<{
    hasMore: boolean;
    rawCount: number;
    videos: YoutubeOwnedUploadSignal[];
  }> {
    const playlistResponse = await firstValueFrom(
      this.httpService.get<YoutubePlaylistItemsResponse>(
        `${YOUTUBE_DATA_API}/playlistItems`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            maxResults: YOUTUBE_VIDEO_LIMIT,
            part: 'snippet,contentDetails',
            playlistId: uploadsPlaylistId,
          },
          timeout: YOUTUBE_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const items = Array.isArray(playlistResponse.data?.items)
      ? playlistResponse.data.items
      : [];
    const videoIds = items
      .map(
        (item) =>
          readString(item.contentDetails?.videoId) ??
          readString(item.snippet?.resourceId?.videoId),
      )
      .filter((id): id is string => Boolean(id));

    if (videoIds.length === 0) {
      return {
        hasMore: typeof playlistResponse.data?.nextPageToken === 'string',
        rawCount: items.length,
        videos: [],
      };
    }

    const videosResponse = await firstValueFrom(
      this.httpService.get<YoutubeVideosResponse>(
        `${YOUTUBE_DATA_API}/videos`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          params: {
            id: videoIds.join(','),
            part: 'id,snippet,contentDetails,statistics',
          },
          timeout: YOUTUBE_SIGNAL_REQUEST_TIMEOUT_MS,
        },
      ),
    );
    const videos = (videosResponse.data?.items ?? []).flatMap((item) => {
      const mapped = this.mapOwnedUpload(item);
      return mapped ? [mapped] : [];
    });

    return {
      hasMore: typeof playlistResponse.data?.nextPageToken === 'string',
      rawCount: items.length,
      videos,
    };
  }

  private mapOwnedUpload(item: {
    contentDetails?: { duration?: unknown };
    id?: unknown;
    snippet?: { publishedAt?: unknown; title?: unknown };
    statistics?: {
      commentCount?: unknown;
      likeCount?: unknown;
      viewCount?: unknown;
    };
  }): YoutubeOwnedUploadSignal | undefined {
    const id = readString(item.id);
    if (!id) {
      return undefined;
    }

    const durationSeconds = parseIsoDurationSeconds(
      item.contentDetails?.duration,
    );
    return {
      commentCount: readNonNegativeInteger(item.statistics?.commentCount),
      createTime: readIsoToUnixSeconds(item.snippet?.publishedAt),
      durationSeconds,
      id,
      likeCount: readNonNegativeInteger(item.statistics?.likeCount),
      mediaType:
        durationSeconds === undefined
          ? undefined
          : durationSeconds <= 60
            ? 'short'
            : 'video',
      publishedAt: readIsoTimestamp(item.snippet?.publishedAt),
      title: readString(item.snippet?.title),
      viewCount: readNonNegativeInteger(item.statistics?.viewCount),
    };
  }

  private async fetchAnalytics(
    accessToken: string,
    channelId: string,
    videoIds: string[],
  ): Promise<{ videos: YoutubeOwnedVideoAnalyticsSignal[] }> {
    const end = new Date();
    const start = new Date(end.getTime() - 28 * 24 * 60 * 60 * 1000);
    const params: Record<string, string | number> = {
      dimensions: 'video',
      endDate: isoDate(end),
      ids: `channel==${channelId}`,
      maxResults: YOUTUBE_VIDEO_LIMIT,
      metrics:
        'views,averageViewDuration,averageViewPercentage,impressions,impressionsClickThroughRate',
      sort: '-views',
      startDate: isoDate(start),
    };
    if (videoIds.length > 0) {
      params.filters = `video==${videoIds.join(',')}`;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.get<YoutubeAnalyticsResponse>(
          `${YOUTUBE_ANALYTICS_API}/reports`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params,
            timeout: YOUTUBE_SIGNAL_REQUEST_TIMEOUT_MS,
          },
        ),
      );
      return { videos: this.mapAnalyticsRows(response.data) };
    } catch (error: unknown) {
      if (isYoutubeScopeError(error) || isYoutubeAuthorizationError(error)) {
        throw error;
      }

      const fallback = await firstValueFrom(
        this.httpService.get<YoutubeAnalyticsResponse>(
          `${YOUTUBE_ANALYTICS_API}/reports`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            params: {
              dimensions: 'video',
              endDate: isoDate(end),
              ids: `channel==${channelId}`,
              maxResults: YOUTUBE_VIDEO_LIMIT,
              metrics: 'views,averageViewDuration,averageViewPercentage',
              sort: '-views',
              startDate: isoDate(start),
              ...(videoIds.length > 0
                ? { filters: `video==${videoIds.join(',')}` }
                : {}),
            },
            timeout: YOUTUBE_SIGNAL_REQUEST_TIMEOUT_MS,
          },
        ),
      );
      return { videos: this.mapAnalyticsRows(fallback.data) };
    }
  }

  private mapAnalyticsRows(
    data: YoutubeAnalyticsResponse | undefined,
  ): YoutubeOwnedVideoAnalyticsSignal[] {
    const headers = (data?.columnHeaders ?? [])
      .map((header) => readString(header.name))
      .filter((name): name is string => Boolean(name));
    const indexOf = (name: string): number => headers.indexOf(name);

    return (data?.rows ?? []).flatMap((row) => {
      const id = readString(row[indexOf('video')]);
      if (!id) {
        return [];
      }

      return [
        {
          averageViewDurationSeconds: readNonNegativeInteger(
            row[indexOf('averageViewDuration')],
          ),
          averageViewPercentage: readNonNegativeNumber(
            row[indexOf('averageViewPercentage')],
          ),
          id,
          impressions: readNonNegativeInteger(row[indexOf('impressions')]),
          impressionsClickThroughRate: readNonNegativeNumber(
            row[indexOf('impressionsClickThroughRate')],
          ),
          views: readNonNegativeInteger(row[indexOf('views')]),
        },
      ];
    });
  }

  private async requestWithRetry<T>(request: () => Promise<T>): Promise<T> {
    return retryProviderRequest(request, {
      getDelayMs: (error, attempt) =>
        getYoutubeRetryAfterMs(
          error,
          YOUTUBE_SIGNAL_RETRY_FALLBACK_MS * 2 ** attempt,
          YOUTUBE_SIGNAL_RETRY_MAX_MS,
        ),
      isRetryable: isYoutubeRateLimitError,
      maxAttempts: YOUTUBE_SIGNAL_MAX_ATTEMPTS,
    });
  }

  private async settle<T>(
    request: () => Promise<T>,
  ): Promise<{ error?: unknown; value?: T }> {
    return settleProviderRequest(this.requestWithRetry(request));
  }

  private isAuthorizationFailure(error: unknown): boolean {
    if (isYoutubeChannelSelectionError(error) || isYoutubeScopeError(error)) {
      return false;
    }
    if (error instanceof HttpException && error.getStatus() === 401) {
      return true;
    }
    return isYoutubeAuthorizationError(error);
  }

  private buildChannelEvidence(
    grantedScopes: string[],
    result: { error?: unknown; value?: { channels: YoutubeChannelNode[] } },
    selected: {
      channel?: YoutubeChannelNode;
      reason?: YoutubeAuthorizedSignalReason;
    },
    previousSnapshot: YoutubeAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): YoutubeAuthorizedSignalEvidence {
    const requiredScopes = dataRequiredScopes(grantedScopes);
    if (!hasYoutubeDataScope(grantedScopes) || selected.reason) {
      return this.buildUnavailableEvidence(
        'channel-fields-platform-signal',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
        hasYoutubeDataScope(grantedScopes) ? selected.reason : 'missing_scope',
      );
    }

    if (!selected.channel) {
      return this.buildUnavailableEvidence(
        'channel-fields-platform-signal',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
      );
    }

    const snippet = selected.channel.snippet;
    const statistics = selected.channel.statistics;
    const value = {
      customUrl: readString(snippet?.customUrl),
      description: readString(snippet?.description),
      hiddenSubscriberCount: readBoolean(statistics?.hiddenSubscriberCount),
      id: readString(selected.channel.id),
      publishedAt: readIsoTimestamp(snippet?.publishedAt),
      subscriberCount: readNonNegativeInteger(statistics?.subscriberCount),
      thumbnailUrl:
        readHttpUrl(snippet?.thumbnails?.high?.url) ??
        readHttpUrl(snippet?.thumbnails?.default?.url),
      title: readString(snippet?.title),
      videoCount: readNonNegativeInteger(statistics?.videoCount),
      viewCount: readNonNegativeInteger(statistics?.viewCount),
    };
    const fieldAvailability = toFieldAvailability(
      CHANNEL_FIELDS.map((field) => [
        field,
        value[field] === undefined ? 'unavailable' : 'available',
      ]),
    );

    return {
      fieldAvailability,
      key: 'channel-fields-platform-signal',
      observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: null,
      status: Object.values(value).every((item) => item === undefined)
        ? 'unavailable'
        : 'available',
      value,
    };
  }

  private buildNativeAccountAgeEvidence(
    channelEvidence: YoutubeAuthorizedSignalEvidence,
    grantedScopes: string[],
    previousSnapshot: YoutubeAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): YoutubeAuthorizedSignalEvidence {
    if (channelEvidence.key !== 'channel-fields-platform-signal') {
      throw new Error('YouTube channel evidence is missing');
    }

    if (channelEvidence.status !== 'available' || !channelEvidence.value) {
      return this.buildUnavailableEvidence(
        'native-account-age',
        dataRequiredScopes(grantedScopes),
        grantedScopes,
        undefined,
        previousSnapshot,
        observedAt,
        channelEvidence.reason,
      );
    }

    const createdAt = channelEvidence.value.publishedAt;
    const createTime = readIsoToUnixSeconds(createdAt);
    return {
      fieldAvailability: toFieldAvailability(
        AGE_FIELDS.map((field) => [
          field,
          (field === 'createdAt' ? createdAt : createTime) === undefined
            ? 'unavailable'
            : 'available',
        ]),
      ),
      key: 'native-account-age',
      observedAt: channelEvidence.observedAt ?? observedAt,
      provenance: 'platform_verified',
      scope: channelEvidence.scope,
      staleAt: channelEvidence.staleAt,
      status: createdAt ? 'available' : 'unavailable',
      value: { createdAt, createTime },
    };
  }

  private buildPublishingCapabilityEvidence(
    grantedScopes: string[],
    channel: YoutubeChannelNode | undefined,
    selectionReason: YoutubeAuthorizedSignalReason | undefined,
    error: unknown,
    previousSnapshot: YoutubeAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): YoutubeAuthorizedSignalEvidence {
    const requiredScopes = publishRequiredScopes(grantedScopes);
    if (!hasYoutubePublishScope(grantedScopes) || selectionReason) {
      return this.buildUnavailableEvidence(
        'publishing-capability-snapshot',
        requiredScopes,
        grantedScopes,
        error,
        previousSnapshot,
        observedAt,
        selectionReason ??
          (hasYoutubePublishScope(grantedScopes) ? undefined : 'missing_scope'),
      );
    }

    if (!channel) {
      return this.buildUnavailableEvidence(
        'publishing-capability-snapshot',
        requiredScopes,
        grantedScopes,
        error,
        previousSnapshot,
        observedAt,
      );
    }

    const value = {
      canPublish: true,
      channelId: readString(channel.id),
      isLinked: readBoolean(channel.status?.isLinked),
      longUploadsStatus: readString(channel.status?.longUploadsStatus),
      privacyStatus: readString(channel.status?.privacyStatus),
    };
    const fieldAvailability = toFieldAvailability(
      PUBLISHING_FIELDS.map((field) => [
        field,
        value[field] === undefined ? 'unavailable' : 'available',
      ]),
    );

    return {
      fieldAvailability,
      key: 'publishing-capability-snapshot',
      observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: null,
      status: 'available',
      value,
    };
  }

  private buildOwnedUploadsEvidence(
    grantedScopes: string[],
    result: {
      error?: unknown;
      value?: {
        hasMore: boolean;
        rawCount: number;
        videos: YoutubeOwnedUploadSignal[];
      };
    },
    selectionReason: YoutubeAuthorizedSignalReason | undefined,
    previousSnapshot: YoutubeAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): YoutubeAuthorizedSignalEvidence {
    const requiredScopes = dataRequiredScopes(grantedScopes);
    if (!result.value || selectionReason) {
      return this.buildUnavailableEvidence(
        'owned-uploads-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
        selectionReason,
      );
    }

    const malformedResponse =
      result.value.rawCount > 0 && result.value.videos.length === 0;
    const fieldAvailability = toFieldAvailability(
      UPLOAD_FIELDS.map((field) => [
        field,
        result.value?.videos.length === 0 ||
        result.value?.videos.every((item) => item[field] !== undefined)
          ? 'available'
          : 'unavailable',
      ]),
    );

    return {
      fieldAvailability,
      key: 'owned-uploads-snapshot',
      observedAt,
      provenance: 'platform_verified',
      ...(malformedResponse ? { reason: 'empty_response' as const } : {}),
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: null,
      status: malformedResponse
        ? 'unavailable'
        : result.value.videos.length === 0
          ? 'empty'
          : 'available',
      value: {
        hasMore: result.value.hasMore,
        videos: result.value.videos,
      },
    };
  }

  private buildFirstUploadEvidence(
    ownedUploads: YoutubeAuthorizedSignalEvidence,
    observedAt: string,
  ): YoutubeAuthorizedSignalEvidence {
    if (ownedUploads.key !== 'owned-uploads-snapshot') {
      throw new Error('YouTube owned-uploads evidence is missing');
    }

    const videos = [...(ownedUploads.value?.videos ?? [])].sort(
      (left, right) => {
        return (
          (left.createTime ?? Number.MAX_SAFE_INTEGER) -
          (right.createTime ?? Number.MAX_SAFE_INTEGER)
        );
      },
    );

    return {
      fieldAvailability: ownedUploads.fieldAvailability,
      key: 'first-upload-platform-signal',
      observedAt: ownedUploads.observedAt ?? observedAt,
      provenance: 'platform_verified',
      ...(ownedUploads.reason ? { reason: ownedUploads.reason } : {}),
      scope: ownedUploads.scope,
      staleAt: ownedUploads.staleAt,
      status: ownedUploads.status,
      value: videos.length > 0 ? { video: videos[0] } : {},
    };
  }

  private buildAnalyticsEvidence(
    grantedScopes: string[],
    result: {
      error?: unknown;
      value?: { videos: YoutubeOwnedVideoAnalyticsSignal[] };
    },
    selectionReason: YoutubeAuthorizedSignalReason | undefined,
    ownedUploads: YoutubeAuthorizedSignalEvidence,
    previousSnapshot: YoutubeAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
  ): YoutubeAuthorizedSignalEvidence {
    const requiredScopes = [YT_ANALYTICS_READONLY_SCOPE];
    if (
      !grantedScopes.includes(YT_ANALYTICS_READONLY_SCOPE) ||
      !result.value ||
      selectionReason
    ) {
      return this.buildUnavailableEvidence(
        'owned-video-analytics-snapshot',
        requiredScopes,
        grantedScopes,
        result.error,
        previousSnapshot,
        observedAt,
        selectionReason ??
          (grantedScopes.includes(YT_ANALYTICS_READONLY_SCOPE)
            ? undefined
            : 'missing_scope'),
      );
    }

    const videos = result.value.videos;
    const fieldAvailability = toFieldAvailability(
      ANALYTICS_FIELDS.map((field) => [
        field,
        videos.length === 0 || videos.every((item) => item[field] !== undefined)
          ? 'available'
          : 'unavailable',
      ]),
    );

    return {
      fieldAvailability,
      key: 'owned-video-analytics-snapshot',
      observedAt: ownedUploads.observedAt ?? observedAt,
      provenance: 'platform_verified',
      scope: this.buildScope(requiredScopes, grantedScopes),
      staleAt: ownedUploads.staleAt,
      status:
        ownedUploads.status === 'empty'
          ? 'empty'
          : videos.length === 0
            ? 'empty'
            : 'available',
      value: { videos },
    };
  }

  private buildUnavailableEvidence(
    key: PlatformEvidenceKey,
    requiredScopes: string[],
    grantedScopes: string[],
    error: unknown,
    previousSnapshot: YoutubeAuthorizedSignalsSnapshot | undefined,
    observedAt: string,
    forcedReason?: YoutubeAuthorizedSignalReason,
  ): YoutubeAuthorizedSignalEvidence {
    const scope = this.buildScope(requiredScopes, grantedScopes);
    const reason: YoutubeAuthorizedSignalReason =
      forcedReason ??
      (isYoutubeChannelSelectionError(error)
        ? 'channel_selection_required'
        : scope.missing.length > 0 || isYoutubeScopeError(error)
          ? 'missing_scope'
          : isYoutubeRateLimitError(error)
            ? 'rate_limited'
            : 'provider_error');
    const previous = previousSnapshot?.evidence.find(
      (evidence) => evidence.key === key,
    );

    if (
      previous &&
      reason !== 'missing_scope' &&
      reason !== 'channel_selection_required'
    ) {
      return {
        ...previous,
        reason,
        scope,
        staleAt: observedAt,
        status: 'stale',
      };
    }

    const fieldNames = this.fieldNamesForKey(key);
    return {
      fieldAvailability: toFieldAvailability(
        fieldNames.map((field) => [
          field,
          reason === 'missing_scope' || reason === 'channel_selection_required'
            ? 'permission_limited'
            : 'unavailable',
        ]),
      ),
      key,
      observedAt,
      provenance: 'platform_verified',
      reason,
      scope:
        isYoutubeScopeError(error) && scope.missing.length === 0
          ? { granted: [], missing: requiredScopes, required: requiredScopes }
          : scope,
      staleAt: null,
      status:
        reason === 'missing_scope' || reason === 'channel_selection_required'
          ? 'permission_limited'
          : reason === 'empty_response'
            ? 'empty'
            : 'unavailable',
    } as YoutubeAuthorizedSignalEvidence;
  }

  private fieldNamesForKey(key: PlatformEvidenceKey): readonly string[] {
    if (key === 'channel-fields-platform-signal') {
      return CHANNEL_FIELDS;
    }
    if (key === 'publishing-capability-snapshot') {
      return PUBLISHING_FIELDS;
    }
    if (key === 'owned-video-analytics-snapshot') {
      return ANALYTICS_FIELDS;
    }
    if (key === 'native-account-age') {
      return AGE_FIELDS;
    }
    return UPLOAD_FIELDS;
  }

  private buildScope(required: string[], grantedScopes: string[]) {
    return {
      granted: grantedScopes.filter((scope) => required.includes(scope)),
      missing: required.filter((scope) => !grantedScopes.includes(scope)),
      required,
    };
  }

  private async buildGenfeedEvidence(
    credential: CredentialDocument,
    organizationId: string,
    observedAt: string,
  ): Promise<YoutubeAuthorizedSignalEvidence> {
    const rows = await this.prisma.post.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        lastAttemptAt: true,
        publicationDate: true,
        publishedAt: true,
        targetExecutionState: true,
        updatedAt: true,
      },
      take: YOUTUBE_VIDEO_LIMIT,
      where: scopedWhere(organizationId, {
        credentialId: credential.id,
        targetExecutionState: {
          in: [
            TargetExecutionState.SCHEDULED,
            TargetExecutionState.PUBLISHING,
            TargetExecutionState.PUBLISHED,
            TargetExecutionState.FAILED,
            TargetExecutionState.PAUSED,
            TargetExecutionState.CANCELLED,
            TargetExecutionState.SKIPPED,
          ],
        },
      }),
    });
    const attempts = rows.flatMap((row) => {
      const outcome = mapOutcome(row.targetExecutionState);
      if (!outcome) {
        return [];
      }
      const attemptedAt =
        row.lastAttemptAt ??
        row.publishedAt ??
        row.publicationDate ??
        row.updatedAt;

      return [
        { attemptedAt: attemptedAt.toISOString(), outcome, postId: row.id },
      ];
    });

    return {
      fieldAvailability: {
        attemptedAt: 'available',
        outcome: 'available',
        postId: 'available',
      },
      key: 'genfeed-publish-outcomes-observed',
      observedAt,
      provenance: 'genfeed_observed',
      scope: { granted: [], missing: [], required: [] },
      staleAt: null,
      status: attempts.length > 0 ? 'available' : 'empty',
      value: { attempts },
    };
  }

  private buildRevokedSnapshot(
    credentialId: string,
    grantedScopes: string[],
    previousSnapshot: YoutubeAuthorizedSignalsSnapshot | undefined,
    genfeedEvidence: YoutubeAuthorizedSignalEvidence,
    refreshAttemptedAt: string,
  ): YoutubeAuthorizedSignalsSnapshot {
    const keys: PlatformEvidenceKey[] = [
      'channel-fields-platform-signal',
      'owned-uploads-snapshot',
      'publishing-capability-snapshot',
      'owned-video-analytics-snapshot',
      'first-upload-platform-signal',
      'native-account-age',
    ];
    const evidence = keys.map((key) => {
      const previous = previousSnapshot?.evidence.find(
        (item) => item.key === key,
      );
      if (previous) {
        return {
          ...previous,
          reason: 'authorization_revoked' as const,
          scope: this.buildScope(this.requiredScopesForKey(key), grantedScopes),
          staleAt: refreshAttemptedAt,
          status: 'revoked' as const,
        };
      }

      return {
        ...this.buildUnavailableEvidence(
          key,
          this.requiredScopesForKey(key),
          grantedScopes,
          undefined,
          undefined,
          refreshAttemptedAt,
        ),
        reason: 'authorization_revoked' as const,
        staleAt: refreshAttemptedAt,
        status: 'revoked' as const,
      };
    });

    return youtubeAuthorizedSignalsSnapshotSchema.parse({
      credentialId,
      evidence: [...evidence, genfeedEvidence],
      grantedScopes,
      platform: CredentialPlatform.YOUTUBE,
      refreshAttemptedAt,
      state: 'revoked',
    });
  }

  private requiredScopesForKey(key: PlatformEvidenceKey): string[] {
    if (key === 'publishing-capability-snapshot') {
      return [YOUTUBE_UPLOAD_SCOPE];
    }
    if (key === 'owned-video-analytics-snapshot') {
      return [YT_ANALYTICS_READONLY_SCOPE];
    }
    return [YOUTUBE_READONLY_SCOPE];
  }

  private resolveSnapshotState(
    evidence: YoutubeAuthorizedSignalEvidence[],
  ): YoutubeAuthorizedSignalsSnapshot['state'] {
    const platformEvidence = evidence.filter(
      (item) => item.provenance === 'platform_verified',
    );

    if (platformEvidence.every((item) => item.status === 'stale')) {
      return 'stale';
    }

    const ownedUploads = platformEvidence.find(
      (item) => item.key === 'owned-uploads-snapshot',
    );
    if (
      ownedUploads?.status === 'empty' &&
      platformEvidence.every((item) =>
        ['available', 'empty'].includes(item.status),
      )
    ) {
      return 'empty';
    }

    return platformEvidence.every((item) =>
      ['available', 'empty'].includes(item.status),
    )
      ? 'full'
      : 'partial';
  }

  private resolveGrantedScopes(
    explicitScopes: readonly string[] | string | undefined,
    credential: Pick<CredentialDocument, 'grantedScopes' | 'warmupSignals'>,
    previousSnapshot: YoutubeAuthorizedSignalsSnapshot | undefined,
  ): string[] {
    const stored = readRecord(credential.warmupSignals);
    const authorization = readRecord(stored[YOUTUBE_AUTHORIZATION_STORAGE_KEY]);
    const persistedScopes =
      Array.isArray(credential.grantedScopes) &&
      credential.grantedScopes.length > 0
        ? credential.grantedScopes
        : undefined;

    return parseYoutubeGrantedScopes(
      explicitScopes ??
        persistedScopes ??
        authorization.grantedScopes ??
        previousSnapshot?.grantedScopes,
    );
  }

  private readStoredSnapshot(
    credential: CredentialDocument,
  ): YoutubeAuthorizedSignalsSnapshot | undefined {
    const stored = readRecord(credential.warmupSignals);
    const parsed = youtubeAuthorizedSignalsSnapshotSchema.safeParse(
      stored[YOUTUBE_AUTHORIZED_SIGNALS_STORAGE_KEY],
    );

    return parsed.success ? parsed.data : undefined;
  }

  private async persistSnapshot(
    credential: CredentialDocument,
    organizationId: string,
    cacheKey: string,
    snapshot: YoutubeAuthorizedSignalsSnapshot,
  ): Promise<YoutubeAuthorizedSignalsSnapshot> {
    await this.credentialsService.mergeWarmupSignals(
      credential.id,
      organizationId,
      {
        [YOUTUBE_AUTHORIZATION_STORAGE_KEY]: {
          grantedScopes: snapshot.grantedScopes,
          observedAt: snapshot.refreshAttemptedAt,
        },
        [YOUTUBE_AUTHORIZED_SIGNALS_STORAGE_KEY]: snapshot,
      },
    );
    if (credential.brandId) {
      await this.socialWarmupEnrollmentsService.syncYoutubeAuthorizedSnapshot({
        brandId: credential.brandId,
        credentialId: credential.id,
        organizationId,
        snapshot,
      });
    }
    await this.cacheService.set(cacheKey, snapshot, {
      tags: [
        CACHE_TAGS.YOUTUBE_AUTHORIZED_SIGNALS,
        SCOPED_CACHE_TAGS.YOUTUBE_AUTHORIZED_SIGNALS(organizationId),
        credential.id,
      ],
      ttl:
        snapshot.state === 'stale' || snapshot.state === 'revoked'
          ? YOUTUBE_STALE_SIGNALS_CACHE_TTL_SECONDS
          : YOUTUBE_AUTHORIZED_SIGNALS_CACHE_TTL_SECONDS,
    });

    this.loggerService.log(`${this.constructorName} refresh completed`, {
      credentialId: credential.id,
      state: snapshot.state,
    });
    return snapshot;
  }
}
