/** Button-card questions the agent onboarding conversation asks, in order. */
export type OnboardingAnswerFieldId =
  | 'goals'
  | 'audience'
  | 'offer'
  | 'competitors'
  | 'platforms'
  | 'tone'
  | 'cadence';

/** `answered` earns the per-answer reward once; `skipped` never does. */
export type OnboardingAnswerStatus = 'answered' | 'skipped';

export interface IOnboardingAnswerFieldProgress {
  status: OnboardingAnswerStatus;
  updatedAt: string;
}

/**
 * Per-brand progress of the onboarding button cards, persisted on
 * `brand.agentConfig.onboardingAnswers` and surfaced next to the brand
 * completeness score.
 */
export interface IOnboardingAnswersProgress {
  fields: Partial<
    Record<OnboardingAnswerFieldId, IOnboardingAnswerFieldProgress>
  >;
  /** True once a public URL scan prefilled the brand. */
  hasScannedWebsite: boolean;
  /** Set when the tone answer was "learn from my Instagram". */
  voiceSource?: 'instagram';
}

/**
 * Card options proposed from the scanned page. They are suggestions grounded
 * in the page text, never saved until the user picks them.
 */
export interface IOnboardingScanSuggestions {
  audiences: string[];
  offers: string[];
  /** Only competitors the page itself names; empty when it names none. */
  competitors: string[];
}

export interface IOnboardingButtonCardOption {
  id: string;
  label: string;
}

/** One button card of the agent onboarding conversation contract. */
export interface IOnboardingButtonCard {
  field: OnboardingAnswerFieldId;
  title: string;
  isMultiSelect: boolean;
  maxSelections?: number;
  /** Fixed options, or only Skip when options come from the scan. */
  options: readonly IOnboardingButtonCardOption[];
  /** Scan suggestion list that supplies the options before Skip. */
  suggestionSource?: keyof IOnboardingScanSuggestions;
  maxSuggestions?: number;
  /** Options used when the scan returned no suggestions. */
  fallbackOptions?: readonly IOnboardingButtonCardOption[];
  /** How the answer maps onto save_onboarding_answers. */
  save: string;
  /** One-line consequence shown before a Skip is confirmed. */
  skipWarning?: string;
}
