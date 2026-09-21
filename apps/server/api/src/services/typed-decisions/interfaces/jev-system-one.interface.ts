/**
 * TypeSafe AI "System One" (Jev) wire shapes.
 *
 * VENDOR BOUNDARY: nothing outside `providers/jev-typed-decision.provider.ts`
 * may import from this file. The epic (#4863) forbids any dependency on the
 * vendor's request/response shape outside its adapter, so swapping Jev for an
 * LLM-with-schema provider stays a one-file change.
 *
 * UNVERIFIED FIELD NAMES: `docs.typesafe.ai` is blocked by this environment's
 * network egress, so the names below were reconstructed from public secondary
 * sources (POST `/v1/systemone` with a `state` plus a map of typed questions
 * of kind `noul` / `choice` / `score`, answered by a map of typed answers with
 * probabilities). Confirm them against the vendor docs before an operator
 * selects Jev anywhere; a mismatch degrades to `null` answers rather than
 * wrong ones, because the parser validates every field.
 */

export const JEV_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';

export const JEV_SYSTEM_ONE_MODEL = 'jev-latest';

/** One question per request keeps latency, parsing and telemetry one-to-one. */
export const JEV_QUESTION_KEY = 'decision';

/**
 * Same retention posture as the LLM dispatcher's `withRetentionPolicy`
 * (ADR #3012 / #3029): zero data retention, no vendor-side storage of tenant
 * state. Sent on every request, first-party and BYOK alike.
 */
export const JEV_RETENTION_POLICY = {
  store: false,
  zero_data_retention: true,
} as const;

/** Score questions are asked on the contract's normalised 0..1 range. */
export const JEV_SCORE_MIN = 0;

export const JEV_SCORE_MAX = 1;

export interface JevNoulQuestion {
  question: string;
  type: 'noul';
}

export interface JevChoiceQuestion {
  options: string[];
  question: string;
  type: 'choice';
}

export interface JevScoreQuestion {
  max: number;
  min: number;
  question: string;
  type: 'score';
}

export type JevQuestion =
  | JevChoiceQuestion
  | JevNoulQuestion
  | JevScoreQuestion;

export interface JevSystemOneRequest {
  model: string;
  questions: Record<string, JevQuestion>;
  /** Tenant data, sent as state — never as instructions. */
  state: Record<string, unknown>;
  store: boolean;
  zero_data_retention: boolean;
}

export interface JevNoulAnswer {
  /** Probability that the statement is true. */
  noul: number;
  type: 'noul';
}

export interface JevChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities?: Record<string, number>;
  type: 'choice';
}

export interface JevScoreAnswer {
  confidence: number;
  score: number;
  type: 'score';
}

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer | JevScoreAnswer;

export interface JevUsage {
  input_tokens?: number;
  output_tokens?: number;
  /** Exact charge when the vendor reports one. */
  cost_micros?: number;
}

export interface JevSystemOneResponse {
  answers: Record<string, JevAnswer>;
  model?: string;
  usage?: JevUsage;
}
