export const YOUTUBE_LONG_FORM_WORKFLOW_ID = 'youtube-to-long-form-text';
export const YOUTUBE_SOURCE_LIBRARY_WORKFLOW_ID = 'youtube-source-to-library';

export const YOUTUBE_LONG_FORM_ACTION_IDS = {
  CREATE_SOURCE_LIBRARY_ASSET: 'youtube.create-source-library-asset',
  EXTRACT_AUDIO: 'youtube.extract-audio',
  PERSIST_OUTPUT: 'long-form.persist-output',
  PLAN_SOURCE_LIBRARY_ASSET: 'youtube.plan-source-library-asset',
  RESOLVE_SOURCE: 'youtube.resolve-source',
  TRANSCRIBE_AUDIO: 'youtube.transcribe-audio',
  TRANSFORM_TEXT: 'long-form.transform-text',
} as const;

export const YOUTUBE_LONG_FORM_OUTPUT_TYPES = [
  'article',
  'linkedin-article',
  'x-article',
  'newsletter',
] as const;

export type YoutubeLongFormOutputType =
  (typeof YOUTUBE_LONG_FORM_OUTPUT_TYPES)[number];
