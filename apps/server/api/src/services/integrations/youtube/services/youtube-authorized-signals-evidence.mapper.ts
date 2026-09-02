import {
  isYoutubeChannelSelectionError,
  isYoutubeRateLimitError,
  isYoutubeScopeError,
} from '@api/services/integrations/youtube/utils/youtube-error.util';
import {
  type YoutubeAuthorizedSignalEvidence,
  type YoutubeAuthorizedSignalReason,
  type YoutubeAuthorizedSignalsSnapshot,
  type YoutubeOwnedUploadSignal,
  type YoutubeOwnedVideoAnalyticsSignal,
  youtubeAuthorizedSignalStatusValues,
} from '@api-types/contracts/youtube-authorized-signals.contract';

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

export interface YoutubeChannelNode {
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

export type PlatformEvidenceKey = Exclude<
  YoutubeAuthorizedSignalEvidence['key'],
  'genfeed-publish-outcomes-observed'
>;

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
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
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

export function readNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  return undefined;
}

export function readIsoTimestamp(value: unknown): string | undefined {
  const candidate = readString(value);
  if (!candidate) {
    return undefined;
  }

  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function readIsoToUnixSeconds(value: unknown): number | undefined {
  const iso = readIsoTimestamp(value);
  if (!iso) {
    return undefined;
  }

  const seconds = Math.floor(Date.parse(iso) / 1000);
  return seconds > 0 ? seconds : undefined;
}

export function parseIsoDurationSeconds(value: unknown): number | undefined {
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

export function hasYoutubeDataScope(grantedScopes: string[]): boolean {
  return (
    grantedScopes.includes(YOUTUBE_SCOPE) ||
    grantedScopes.includes(YOUTUBE_READONLY_SCOPE)
  );
}

export function hasYoutubePublishScope(grantedScopes: string[]): boolean {
  return (
    grantedScopes.includes(YOUTUBE_SCOPE) ||
    grantedScopes.includes(YOUTUBE_UPLOAD_SCOPE)
  );
}

export function dataRequiredScopes(grantedScopes: string[]): string[] {
  if (grantedScopes.includes(YOUTUBE_SCOPE)) {
    return [YOUTUBE_SCOPE];
  }
  if (grantedScopes.includes(YOUTUBE_READONLY_SCOPE)) {
    return [YOUTUBE_READONLY_SCOPE];
  }
  return [YOUTUBE_READONLY_SCOPE];
}

export function publishRequiredScopes(grantedScopes: string[]): string[] {
  if (grantedScopes.includes(YOUTUBE_SCOPE)) {
    return [YOUTUBE_SCOPE];
  }
  if (grantedScopes.includes(YOUTUBE_UPLOAD_SCOPE)) {
    return [YOUTUBE_UPLOAD_SCOPE];
  }
  return [YOUTUBE_UPLOAD_SCOPE];
}

export class YoutubeAuthorizedSignalsEvidenceMapper {
  buildChannelEvidence(
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

  buildNativeAccountAgeEvidence(
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

  buildPublishingCapabilityEvidence(
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

  buildOwnedUploadsEvidence(
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

  buildFirstUploadEvidence(
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

  buildAnalyticsEvidence(
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

  buildUnavailableEvidence(
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

  fieldNamesForKey(key: PlatformEvidenceKey): readonly string[] {
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

  buildScope(required: string[], grantedScopes: string[]) {
    return {
      granted: grantedScopes.filter((scope) => required.includes(scope)),
      missing: required.filter((scope) => !grantedScopes.includes(scope)),
      required,
    };
  }
}
