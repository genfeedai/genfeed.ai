export const PUBLIC_YOUTUBE_LONG_FORM_OUTPUT_TYPES = [
  'article',
  'linkedin-article',
  'x-article',
  'newsletter',
] as const;

export type PublicYoutubeLongFormOutputType =
  (typeof PUBLIC_YOUTUBE_LONG_FORM_OUTPUT_TYPES)[number];

export interface IPublicYoutubeLongFormToolResult {
  readonly content: string;
  readonly executionId: string;
  readonly id: string;
  readonly outputType: PublicYoutubeLongFormOutputType;
  readonly summary: string;
  readonly title: string;
  readonly videoId: string;
  readonly youtubeUrl: string;
}
