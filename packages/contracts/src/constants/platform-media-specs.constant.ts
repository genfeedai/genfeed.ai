import { CredentialPlatform } from '..';
import type {
  MediaAspectRatio,
  MediaReadinessKind,
  PlatformMediaSpec,
} from '../api-types/contracts/media-readiness.contract';

/**
 * Seed media specs for the platforms Genfeed can publish to today
 * (`PUBLISH_PLATFORMS` plus Threads).
 *
 * Every entry carries the provider documentation page it was transcribed from
 * in `documentationUrl` and the date it was last checked in `sourcedAt`.
 * Provider limits drift, so the entries are data — re-read the cited page and
 * bump `sourcedAt` each release rather than changing evaluator code. Whether a
 * property blocks or warns lives here too (`defaultSeverity` plus per-property
 * `severities`); the evaluator never decides that.
 *
 * Numbers are the provider's published hard limits, not Genfeed preferences.
 * Where a provider documents a permissive range (Instagram accepts 0.01:1 to
 * 10:1) the entry lists the ratios the platform actually renders well and
 * downgrades `aspectRatio` to a warning, so an unusual crop is surfaced
 * without blocking a publish the provider would have accepted.
 *
 * Type-only import of `PlatformMediaSpec` keeps this module free of a runtime
 * dependency on `@genfeedai/contracts/api-types/contracts`.
 */

const RATIO_SQUARE: MediaAspectRatio = { height: 1, label: '1:1', width: 1 };
const RATIO_PORTRAIT_4_5: MediaAspectRatio = {
  height: 5,
  label: '4:5',
  width: 4,
};
const RATIO_VERTICAL_9_16: MediaAspectRatio = {
  height: 16,
  label: '9:16',
  width: 9,
};
const RATIO_LANDSCAPE_16_9: MediaAspectRatio = {
  height: 9,
  label: '16:9',
  width: 16,
};
const RATIO_LANDSCAPE_1_91_1: MediaAspectRatio = {
  height: 1,
  label: '1.91:1',
  width: 1.91,
};

const KILOBYTE = 1024;
const MEGABYTE = 1024 * KILOBYTE;
const GIGABYTE = 1024 * MEGABYTE;

export const PLATFORM_MEDIA_SPECS: readonly PlatformMediaSpec[] = [
  // Instagram image posts.
  // https://developers.facebook.com/docs/instagram-platform/content-publishing
  // JPEG only, 8 MB ceiling, 320–1440 px width, 4:5 through 1.91:1.
  // Container stays a warning rather than a block: the documented list has not
  // had a live docs pass, and a PNG the provider would still accept should not
  // be refused before dispatch.
  {
    aspectRatios: [RATIO_PORTRAIT_4_5, RATIO_SQUARE, RATIO_LANDSCAPE_1_91_1],
    aspectRatioTolerance: 0.05,
    audioCodecs: [],
    containers: ['image2', 'jpeg', 'jpg', 'mjpeg'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    kind: 'image',
    maxFileSizeBytes: 8 * MEGABYTE,
    maxWidth: 1440,
    minWidth: 320,
    platform: CredentialPlatform.INSTAGRAM,
    severities: {
      aspectRatio: 'warning',
      container: 'warning',
      probe: 'warning',
    },
    sourcedAt: '2026-09-19',
    videoCodecs: [],
  },
  // Instagram Reels.
  // https://developers.facebook.com/docs/instagram-platform/content-publishing
  // MOV/MP4, H264 or HEVC video, AAC audio, 23–60 FPS, 3 s–15 min, 1 GB,
  // maximum 1920 horizontal pixels.
  {
    aspectRatios: [RATIO_VERTICAL_9_16],
    aspectRatioTolerance: 0.05,
    audioCodecs: ['aac'],
    containers: ['mov', 'mp4'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developers.facebook.com/docs/instagram-platform/content-publishing',
    kind: 'video',
    maxDurationSeconds: 15 * 60,
    maxFileSizeBytes: GIGABYTE,
    maxFrameRate: 60,
    maxWidth: 1920,
    minDurationSeconds: 3,
    minFrameRate: 23,
    platform: CredentialPlatform.INSTAGRAM,
    severities: { aspectRatio: 'warning', probe: 'warning' },
    sourcedAt: '2026-09-19',
    videoCodecs: ['h264', 'hevc'],
  },
  // Threads image posts.
  // https://developers.facebook.com/docs/threads/create-posts
  // JPEG/PNG, 8 MB ceiling, 320–1440 px width, up to 10:1.
  {
    aspectRatios: [RATIO_SQUARE, RATIO_PORTRAIT_4_5, RATIO_LANDSCAPE_16_9],
    aspectRatioTolerance: 0.1,
    audioCodecs: [],
    containers: ['image2', 'jpeg', 'jpg', 'mjpeg', 'png_pipe'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developers.facebook.com/docs/threads/create-posts',
    kind: 'image',
    maxFileSizeBytes: 8 * MEGABYTE,
    maxWidth: 1440,
    minWidth: 320,
    platform: CredentialPlatform.THREADS,
    severities: {
      aspectRatio: 'warning',
      container: 'warning',
      probe: 'warning',
    },
    sourcedAt: '2026-09-19',
    videoCodecs: [],
  },
  // Threads video posts.
  // https://developers.facebook.com/docs/threads/create-posts
  // MOV/MP4, H264 or HEVC, AAC audio, 23–60 FPS, up to 5 minutes and 1 GB,
  // maximum 1920 horizontal pixels.
  {
    aspectRatios: [RATIO_VERTICAL_9_16, RATIO_SQUARE, RATIO_LANDSCAPE_16_9],
    aspectRatioTolerance: 0.1,
    audioCodecs: ['aac'],
    containers: ['mov', 'mp4'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developers.facebook.com/docs/threads/create-posts',
    kind: 'video',
    maxDurationSeconds: 5 * 60,
    maxFileSizeBytes: GIGABYTE,
    maxFrameRate: 60,
    maxWidth: 1920,
    minFrameRate: 23,
    platform: CredentialPlatform.THREADS,
    severities: { aspectRatio: 'warning', probe: 'warning' },
    sourcedAt: '2026-09-19',
    videoCodecs: ['h264', 'hevc'],
  },
  // TikTok photo posts.
  // https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide/
  // JPG/JPEG/WEBP, 20 MB per photo.
  {
    aspectRatios: [RATIO_VERTICAL_9_16, RATIO_SQUARE],
    aspectRatioTolerance: 0.1,
    audioCodecs: [],
    containers: ['image2', 'jpeg', 'jpg', 'mjpeg', 'webp_pipe'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide/',
    kind: 'image',
    maxFileSizeBytes: 20 * MEGABYTE,
    platform: CredentialPlatform.TIKTOK,
    severities: {
      aspectRatio: 'warning',
      container: 'warning',
      probe: 'warning',
    },
    sourcedAt: '2026-09-19',
    videoCodecs: [],
  },
  // TikTok video posts.
  // https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide/
  // MP4/WebM/MOV, 4 GB ceiling, 3 s–10 min, 23–60 FPS, 360 px minimum side.
  // `webm` covers the ffprobe matroska,webm family without accepting MKV.
  {
    aspectRatios: [RATIO_VERTICAL_9_16],
    aspectRatioTolerance: 0.1,
    audioCodecs: ['aac', 'mp3', 'opus'],
    containers: ['mov', 'mp4', 'webm'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide/',
    kind: 'video',
    maxDurationSeconds: 10 * 60,
    maxFileSizeBytes: 4 * GIGABYTE,
    maxFrameRate: 60,
    minDurationSeconds: 3,
    minFrameRate: 23,
    minHeight: 360,
    minWidth: 360,
    platform: CredentialPlatform.TIKTOK,
    severities: {
      aspectRatio: 'warning',
      frameRate: 'warning',
      probe: 'warning',
    },
    sourcedAt: '2026-09-19',
    videoCodecs: ['h264', 'hevc', 'vp8', 'vp9'],
  },
  // YouTube uploads.
  // https://developers.google.com/youtube/v3/docs/videos/insert (256 GB ceiling)
  // https://support.google.com/youtube/answer/1722171 (recommended encoding:
  // MP4 container, H.264 video, AAC-LC audio, 24–60 FPS)
  {
    aspectRatios: [RATIO_LANDSCAPE_16_9, RATIO_VERTICAL_9_16],
    aspectRatioTolerance: 0.1,
    audioCodecs: ['aac', 'flac', 'mp3', 'opus', 'vorbis'],
    containers: ['matroska', 'mov', 'mp4', 'mpegts', 'webm'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developers.google.com/youtube/v3/docs/videos/insert',
    kind: 'video',
    maxDurationSeconds: 12 * 60 * 60,
    maxFileSizeBytes: 256 * GIGABYTE,
    maxFrameRate: 60,
    minDurationSeconds: 1,
    minHeight: 144,
    minWidth: 256,
    platform: CredentialPlatform.YOUTUBE,
    severities: {
      aspectRatio: 'warning',
      frameRate: 'warning',
      probe: 'warning',
    },
    sourcedAt: '2026-09-19',
    videoCodecs: ['av1', 'h264', 'hevc', 'vp9'],
  },
  // X (Twitter) images.
  // https://developer.x.com/en/docs/x-api/v1/media/upload-media/uploading-media/media-best-practices
  // JPG/PNG/WEBP/GIF, 5 MB photo ceiling, up to 8192 px per side,
  // rendered between 1:3 and 3:1.
  {
    aspectRatios: [RATIO_LANDSCAPE_16_9, RATIO_SQUARE, RATIO_PORTRAIT_4_5],
    aspectRatioTolerance: 0.1,
    audioCodecs: [],
    containers: [
      'gif',
      'image2',
      'jpeg',
      'jpg',
      'mjpeg',
      'png_pipe',
      'webp_pipe',
    ],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developer.x.com/en/docs/x-api/v1/media/upload-media/uploading-media/media-best-practices',
    kind: 'image',
    maxFileSizeBytes: 5 * MEGABYTE,
    maxHeight: 8192,
    maxWidth: 8192,
    platform: CredentialPlatform.TWITTER,
    severities: {
      aspectRatio: 'warning',
      container: 'warning',
      probe: 'warning',
    },
    sourcedAt: '2026-09-19',
    videoCodecs: [],
  },
  // X (Twitter) videos.
  // https://developer.x.com/en/docs/x-api/v1/media/upload-media/uploading-media/media-best-practices
  // MP4 with H.264 High Profile video and AAC LC audio, 512 MB ceiling,
  // 0.5–140 s, 32×32 up to 1280×1024, 60 FPS maximum.
  {
    aspectRatios: [RATIO_LANDSCAPE_16_9, RATIO_SQUARE, RATIO_VERTICAL_9_16],
    aspectRatioTolerance: 0.1,
    audioCodecs: ['aac'],
    containers: ['mp4'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://developer.x.com/en/docs/x-api/v1/media/upload-media/uploading-media/media-best-practices',
    kind: 'video',
    maxDurationSeconds: 140,
    maxFileSizeBytes: 512 * MEGABYTE,
    maxFrameRate: 60,
    maxHeight: 1024,
    maxWidth: 1280,
    minDurationSeconds: 0.5,
    minHeight: 32,
    minWidth: 32,
    platform: CredentialPlatform.TWITTER,
    severities: { aspectRatio: 'warning', probe: 'warning' },
    sourcedAt: '2026-09-19',
    videoCodecs: ['h264'],
  },
  // LinkedIn images.
  // https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api
  // JPEG/PNG/GIF, 10 MB ceiling.
  {
    aspectRatios: [RATIO_LANDSCAPE_1_91_1, RATIO_SQUARE, RATIO_PORTRAIT_4_5],
    aspectRatioTolerance: 0.1,
    audioCodecs: [],
    containers: ['gif', 'image2', 'jpeg', 'jpg', 'mjpeg', 'png_pipe'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api',
    kind: 'image',
    maxFileSizeBytes: 10 * MEGABYTE,
    platform: CredentialPlatform.LINKEDIN,
    severities: {
      aspectRatio: 'warning',
      container: 'warning',
      probe: 'warning',
    },
    sourcedAt: '2026-09-19',
    videoCodecs: [],
  },
  // LinkedIn videos.
  // https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api
  // MP4, 75 KB–500 MB, 3 s–30 min, 256×144 up to 4096×2304, 10–60 FPS,
  // 1:2.4 through 2.4:1. Both ends of the file-size range are enforced.
  {
    aspectRatios: [RATIO_LANDSCAPE_16_9, RATIO_SQUARE, RATIO_VERTICAL_9_16],
    aspectRatioTolerance: 0.1,
    audioCodecs: ['aac', 'mp3'],
    containers: ['mp4'],
    defaultSeverity: 'error',
    documentationUrl:
      'https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/videos-api',
    kind: 'video',
    maxDurationSeconds: 30 * 60,
    maxFileSizeBytes: 500 * MEGABYTE,
    maxFrameRate: 60,
    maxHeight: 2304,
    maxWidth: 4096,
    minDurationSeconds: 3,
    minFileSizeBytes: 75 * KILOBYTE,
    minFrameRate: 10,
    minHeight: 144,
    minWidth: 256,
    platform: CredentialPlatform.LINKEDIN,
    severities: {
      aspectRatio: 'warning',
      frameRate: 'warning',
      probe: 'warning',
    },
    sourcedAt: '2026-09-19',
    videoCodecs: ['h264', 'hevc'],
  },
];

/** Platforms with at least one seeded media spec. */
export const MEDIA_SPEC_PLATFORMS: readonly CredentialPlatform[] = Array.from(
  new Set(PLATFORM_MEDIA_SPECS.map((spec) => spec.platform)),
);

export function getPlatformMediaSpec(
  platform: CredentialPlatform,
  kind: MediaReadinessKind,
): PlatformMediaSpec | undefined {
  return PLATFORM_MEDIA_SPECS.find(
    (spec) => spec.platform === platform && spec.kind === kind,
  );
}

export function getPlatformMediaSpecs(
  platform: CredentialPlatform,
): readonly PlatformMediaSpec[] {
  return PLATFORM_MEDIA_SPECS.filter((spec) => spec.platform === platform);
}
