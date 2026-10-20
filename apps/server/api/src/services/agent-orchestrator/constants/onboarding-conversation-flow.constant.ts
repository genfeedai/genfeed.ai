import type {
  IOnboardingButtonCard,
  IOnboardingButtonCardOption,
} from '@genfeedai/contracts/interfaces';

const SKIP: IOnboardingButtonCardOption = { id: 'skip', label: 'Skip' };

/**
 * The button cards asked after the scan is confirmed, in order. Every card is
 * button-only (allowFreeText: false), has at most 5 options and ends with
 * Skip. Scan-sourced cards list at most `maxSuggestions` page-grounded
 * suggestions before Skip and fall back to `fallbackOptions`.
 */
export const ONBOARDING_BUTTON_CARDS: readonly IOnboardingButtonCard[] = [
  {
    field: 'goals',
    title: 'Goal',
    isMultiSelect: true,
    maxSelections: 3,
    options: [
      { id: 'grow_audience', label: 'Grow audience' },
      { id: 'drive_sales', label: 'Drive sales' },
      { id: 'build_authority', label: 'Build authority' },
      { id: 'stay_consistent', label: 'Stay consistent' },
      SKIP,
    ],
    save: 'goals: the chosen labels',
    askReason: 'so every post works toward what you want',
  },
  {
    field: 'audience',
    title: 'Audience',
    isMultiSelect: true,
    maxSelections: 2,
    suggestionSource: 'audiences',
    maxSuggestions: 4,
    options: [SKIP],
    fallbackOptions: [
      { id: 'consumers', label: 'Consumers' },
      { id: 'small_businesses', label: 'Small businesses' },
      { id: 'professionals', label: 'Professionals' },
      { id: 'creators', label: 'Creators' },
      SKIP,
    ],
    save: 'audience: the chosen labels',
    askReason: 'so posts talk to the right people',
    skipWarning:
      'Without an audience, posts talk to everyone and land with no one.',
  },
  {
    field: 'offer',
    title: 'Offer',
    isMultiSelect: false,
    suggestionSource: 'offers',
    maxSuggestions: 4,
    options: [SKIP],
    fallbackOptions: [
      { id: 'products', label: 'Products' },
      { id: 'services', label: 'Services' },
      { id: 'memberships', label: 'Memberships' },
      { id: 'free_trial', label: 'Free trial or demo' },
      SKIP,
    ],
    save: 'offer: the chosen label',
    askReason: 'so calls to action point at what you sell',
    skipWarning: 'Without an offer, calls to action stay vague.',
  },
  {
    field: 'competitors',
    title: 'Competitors',
    isMultiSelect: true,
    maxSelections: 3,
    suggestionSource: 'competitors',
    maxSuggestions: 3,
    options: [SKIP],
    save: 'competitors: the chosen labels',
    askReason: 'so I can position you against them',
    skipWarning:
      "Without competitors, I can't position you against them or track their ads and trends.",
  },
  {
    field: 'platforms',
    title: 'Platforms',
    isMultiSelect: true,
    maxSelections: 4,
    options: [
      { id: 'x', label: 'X' },
      { id: 'linkedin', label: 'LinkedIn' },
      { id: 'instagram', label: 'Instagram' },
      { id: 'short_video', label: 'TikTok / YouTube' },
      SKIP,
    ],
    save: 'platforms: short_video saves both tiktok and youtube; the other ids map directly to their platform values',
    askReason: 'so drafts fit the channels you post on',
  },
  {
    field: 'tone',
    title: 'Tone',
    isMultiSelect: false,
    options: [
      { id: 'keep', label: 'Keep it as found' },
      { id: 'casual', label: 'More casual' },
      { id: 'professional', label: 'More professional' },
      { id: 'learn_from_instagram', label: 'Learn from my Instagram' },
      SKIP,
    ],
    save: 'toneAdjustment: the chosen id (keep preserves the scanned voice)',
    askReason: 'so posts sound like you',
  },
  {
    field: 'cadence',
    title: 'Cadence',
    isMultiSelect: false,
    options: [
      { id: 'daily', label: 'Daily' },
      { id: 'few_times_week', label: 'A few times a week' },
      { id: 'weekly', label: 'Weekly' },
      SKIP,
    ],
    save: 'cadence: the chosen id',
    askReason: 'so I plan the right amount of content',
  },
];
