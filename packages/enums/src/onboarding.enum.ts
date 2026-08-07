/**
 * Which onboarding flow a user was routed through. Values match Prisma
 * `OnboardingType` exactly.
 *
 * `users.onboardingType` is a Postgres enum column, so these are Prisma labels.
 * The other enums in this file (`OnboardingStep`, `OnboardingStatus`,
 * `BrandExtractionStatus`) are product vocabulary with no column behind them —
 * they stay lowercase on purpose.
 *
 * @see packages/prisma/prisma/schema.prisma `enum OnboardingType`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const OnboardingType = {
  CREATOR: 'CREATOR',
  ORGANIZATION: 'ORGANIZATION',
} as const;

export type OnboardingType =
  (typeof OnboardingType)[keyof typeof OnboardingType];

/**
 * Onboarding step identifiers
 */
export enum OnboardingStep {
  WELCOME = 'welcome',
  BRAND_URL = 'brand_url',
  PROCESSING = 'processing',
  REVIEW = 'review',
  COMPLETED = 'completed',
}

/**
 * Onboarding status for tracking progress
 */
export enum OnboardingStatus {
  NOT_STARTED = 'not_started',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  SKIPPED = 'skipped',
}

/**
 * Brand extraction status
 */
export enum BrandExtractionStatus {
  PENDING = 'pending',
  SCRAPING = 'scraping',
  ANALYZING = 'analyzing',
  GENERATING_PROMPTS = 'generating_prompts',
  COMPLETED = 'completed',
  FAILED = 'failed',
}
