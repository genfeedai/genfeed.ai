export const PUBLIC_YOUTUBE_CLIPPER_TOOL_STATUSES = [
  'queued',
  'analyzing',
  'ready',
  'failed',
  'claimed',
] as const;

export type PublicYoutubeClipperToolStatus =
  (typeof PUBLIC_YOUTUBE_CLIPPER_TOOL_STATUSES)[number];

export const PUBLIC_YOUTUBE_CLIPPER_PREVIEW_STATUSES = [
  'available',
  'queued',
  'generating',
  'ready',
  'failed',
] as const;

export type PublicYoutubeClipperPreviewStatus =
  (typeof PUBLIC_YOUTUBE_CLIPPER_PREVIEW_STATUSES)[number];

export interface IPublicYoutubeTranscriptSegment {
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

export interface IPublicYoutubeClipperRecommendation {
  readonly clipType: string;
  readonly endTime: number;
  readonly id: string;
  readonly score: number;
  readonly startTime: number;
  readonly summary: string;
  readonly tags: string[];
  readonly title: string;
}

export interface IPublicYoutubeClipperPreview {
  readonly recommendationId?: string;
  readonly status: PublicYoutubeClipperPreviewStatus;
  readonly url?: string;
}

export interface IPublicYoutubeClipperToolSession {
  readonly errorCode?: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly preview: IPublicYoutubeClipperPreview;
  readonly previewToken: string;
  readonly progress: number;
  readonly recommendations: IPublicYoutubeClipperRecommendation[];
  readonly status: PublicYoutubeClipperToolStatus;
  readonly transcript: IPublicYoutubeTranscriptSegment[];
}

export interface IPublicYoutubeClipperToolClaim {
  readonly projectId: string;
  readonly status: 'claimed';
}
