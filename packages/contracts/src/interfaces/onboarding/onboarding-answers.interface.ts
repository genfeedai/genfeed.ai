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
  /**
   * One-line reason the agent gives when it asks this card after onboarding,
   * e.g. "so posts talk to the right people".
   */
  askReason: string;
}

/** One in-flow brand-context question the agent asked in a conversation. */
export interface IBrandContextAsk {
  askedAt: string;
  threadId: string;
}

/**
 * Last in-flow ask per field, persisted on `brand.agentConfig.brandContextAsks`.
 * It drives the ask cooldown; answers and skips stay on `onboardingAnswers`.
 */
export type BrandContextAsks = Partial<
  Record<OnboardingAnswerFieldId, IBrandContextAsk>
>;

/** A high-value brand field the agent may ask about after onboarding. */
export interface IMissingBrandContextField {
  field: OnboardingAnswerFieldId;
  /** `skipped`: the user skipped it before and the cooldown has passed. */
  status: 'missing' | 'skipped';
}

/** Missing brand fields in ask priority order, plus stored scan suggestions. */
export interface IMissingBrandContext {
  fields: IMissingBrandContextField[];
  suggestions: IOnboardingScanSuggestions;
}

/** The exact request_input card an in-flow brand-context ask must send. */
export interface IBrandContextAskCard {
  field: OnboardingAnswerFieldId;
  requestId: string;
  title: string;
  isMultiSelect: boolean;
  maxSelections?: number;
  /** Answer options followed by Skip as the last option. */
  options: IOnboardingButtonCardOption[];
  reason: string;
  /** How the answer maps onto save_onboarding_answers. */
  save: string;
}

/** The parts of a request_input call checked against an in-flow ask card. */
export interface IBrandContextAskRequest {
  requestId: string;
  allowFreeText?: boolean;
  isMultiSelect: boolean;
  maxSelections?: number;
  options: IOnboardingButtonCardOption[];
}
