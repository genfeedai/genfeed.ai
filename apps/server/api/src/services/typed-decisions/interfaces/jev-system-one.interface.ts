/**
 * TypeSafe AI "System One" (Jev) wire shapes.
 *
 * VENDOR BOUNDARY: nothing outside `providers/jev-typed-decision.provider.ts`
 * may import from this file. The epic (#4863) forbids any dependency on the
 * vendor's request/response shape outside its adapter, so swapping Jev for an
 * LLM-with-schema provider stays a one-file change.
 *
 * VERIFIED (#4906) against the official SDK, `typesafe-ai/typesafe-sdk-js`
 * (`src/types.ts`, `src/questions.ts`, `src/client.ts`), read 2026-09-21. The
 * field names below mirror those files one-to-one: the question text is
 * `instructions`, choice options are a `criteria` map of label → description,
 * score is an ordinal rubric (`criteria` list indexed from zero) whose answer
 * is an expected value that may fall between levels, and usage carries token
 * counts only.
 *
 * RETENTION: the request has no retention flags because the API has none.
 * Zero data retention is an account-level term with the vendor, not a
 * per-request assertion, and must be settled before shadow mode runs on
 * Cloud.
 */

export const JEV_SYSTEM_ONE_URL = 'https://api.typesafe.ai/v1/systemone';

export const JEV_SYSTEM_ONE_MODEL = 'jev-latest';

/** One question per request keeps latency, parsing and telemetry one-to-one. */
export const JEV_QUESTION_KEY = 'decision';

/**
 * Published list price in USD per million tokens (input-only billing, output
 * free), read 2026-09-21 from the vendor's public pricing. The response
 * reports token counts and no charge, so the ledger entry it produces is
 * `calculated`, never `observed`. Re-check on each price change.
 */
export const JEV_PRICING_USD_PER_MILLION_TOKENS = {
  completion: 0,
  prompt: 0.042,
} as const;

/**
 * The provider's own ordinal range for contract scores: five rubric levels,
 * index 0 the lowest. A call site may pass a finer or domain-specific `scale`.
 */
export const JEV_DEFAULT_SCORE_CRITERIA: readonly [
  string,
  string,
  ...string[],
] = ['not at all', 'slightly', 'moderately', 'very', 'extremely'];

/** Text, a JSON object or array, or `null` (the SDK's `EntryType`). */
export type JevEntry = string | Record<string, unknown> | unknown[] | null;

export interface JevNoulQuestion {
  criteria?: { false?: JevEntry; true?: JevEntry } | null;
  instructions: JevEntry;
  type: 'noul';
}

/** Labels mapped to descriptions; `null` leaves a label undescribed. */
export interface JevChoiceQuestion {
  criteria: Record<string, JevEntry>;
  instructions: JevEntry;
  type: 'choice';
}

/** At least two descriptions indexed by score from zero. */
export interface JevScoreQuestion {
  criteria: readonly [JevEntry, JevEntry, ...JevEntry[]];
  instructions: JevEntry;
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
  /** Expected score on the rubric; may fall between integer levels. */
  score: number;
  type: 'score';
}

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer | JevScoreAnswer;

/** Token counts only; the API reports no charge. */
export interface JevUsage {
  input_tokens?: number;
  output_tokens?: number;
}

export interface JevSystemOneResponse {
  answers: Record<string, JevAnswer>;
  model?: string;
  usage?: JevUsage;
}
