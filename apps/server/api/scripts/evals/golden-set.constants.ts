export const GOLDEN_CONTENT_KINDS = [
  'social-post',
  'thread',
  'article',
  'script',
  'newsletter',
  'image-caption',
] as const;

export const GOLDEN_LABEL_SOURCES = [
  'batch-item-review',
  'evaluation-decision',
  'evaluation-score',
  'harness-avoid',
  'harness-seed',
  'harness-winner',
  'newsletter-approval',
  'post-review',
] as const;

export const KIND_PROMPT_TEMPLATES = {
  'social-post': "Write a social post for {brandFixtureId}'s audience.",
  thread: "Write a thread for {brandFixtureId}'s audience.",
  article: "Write an article for {brandFixtureId}'s audience.",
  script: "Write a short video script for {brandFixtureId}'s audience.",
  newsletter: "Write a newsletter for {brandFixtureId}'s audience.",
  'image-caption': "Write an image caption for {brandFixtureId}'s audience.",
} as const;

export const AGREEMENT_FLOOR = {
  minKappa: 0.4,
  minPairs: 20,
  minPercentAgreementWhenKappaUndefined: 0.8,
} as const;

export const GOLDEN_SET_RUBRIC_VERSION = 'content-quality-v1';
export const SYNTHETIC_ANONYMISER_KEY =
  'genfeed-golden-set-v1-synthetic-public-key';
export const HARNESS_PROFILE_TYPE = 'harness';
export const WINNERS_CONTEXT_PURPOSE = 'harness-performance-winners';
export const READER_PAGE_SIZE = 500;

export const EXCLUSION_REASONS = [
  'conflict',
  'copyOfReview',
  'emptyText',
  'missingContent',
  'noBrand',
  'noLabel',
  'outOfScopeBrand',
  'residualIdentifier',
  'unsupportedKind',
] as const;

export const ANONYMISER_TOKEN_PATTERN =
  /\[(?:email|handle|id|organization|person|url)\]|\bbrand-[0-9a-f]{12}\b/g;
