import { Platform } from './platform.enum';

export enum EvaluationType {
  PRE_PUBLICATION = 'pre-publication',
  POST_PUBLICATION = 'post-publication',
  EXTERNAL_ANALYSIS = 'external-analysis',
}

export enum EvaluationSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum EvaluationMode {
  CHEAP = 'cheap',
  DEEP = 'deep',
}

export const ExternalPlatform = {
  FACEBOOK: Platform.FACEBOOK,
  INSTAGRAM: Platform.INSTAGRAM,
  LINKEDIN: Platform.LINKEDIN,
  TIKTOK: Platform.TIKTOK,
  TWITTER: Platform.TWITTER,
  YOUTUBE: Platform.YOUTUBE,
} as const;

export type ExternalPlatform =
  (typeof ExternalPlatform)[keyof typeof ExternalPlatform];

export enum EvaluationScoreCategory {
  TECHNICAL = 'technical',
  BRAND = 'brand',
  ENGAGEMENT = 'engagement',
}
