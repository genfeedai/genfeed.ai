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
