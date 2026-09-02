export const PUBLIC_YOUTUBE_CLIP_TOOL_STATUSES = [
  'queued',
  'analyzing',
  'ready',
  'failed',
  'claimed',
] as const;

export type PublicYoutubeClipToolStatus =
  (typeof PUBLIC_YOUTUBE_CLIP_TOOL_STATUSES)[number];

export const PUBLIC_YOUTUBE_CLIP_PREVIEW_STATUSES = [
  'available',
  'queued',
  'generating',
  'ready',
  'failed',
] as const;

export type PublicYoutubeClipPreviewStatus =
  (typeof PUBLIC_YOUTUBE_CLIP_PREVIEW_STATUSES)[number];

export interface IPublicYoutubeTranscriptSegment {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

export interface IPublicYoutubeClipRecommendation {
  readonly clipType: string;
  readonly endTime: number;
  readonly id: string;
  readonly score: number;
  readonly startTime: number;
  readonly summary: string;
  readonly tags: string[];
  readonly title: string;
}

export interface IPublicYoutubeClipPreview {
  readonly recommendationId?: string;
  readonly status: PublicYoutubeClipPreviewStatus;
  readonly url?: string;
}

export interface IPublicYoutubeClipToolSession {
  readonly errorCode?: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly preview: IPublicYoutubeClipPreview;
  readonly previewToken: string;
  readonly progress: number;
  readonly recommendations: IPublicYoutubeClipRecommendation[];
  readonly status: PublicYoutubeClipToolStatus;
  readonly transcript: IPublicYoutubeTranscriptSegment[];
}

export interface IPublicYoutubeClipToolClaim {
  readonly projectId: string;
  readonly status: 'claimed';
}
