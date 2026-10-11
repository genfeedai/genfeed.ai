import { readOnboardingAnswersProgress } from '@api/collections/brands/utils/onboarding-answers-progress.util';
import type {
  BrandContextAsks,
  IBrandContextAsk,
  IMissingBrandContext,
  IMissingBrandContextField,
  IOnboardingScanSuggestions,
  OnboardingAnswerFieldId,
} from '@genfeedai/contracts/interfaces';
import { ONBOARDING_ANSWER_FIELD_IDS } from '@genfeedai/contracts/types';
import { computeBrandCompleteness } from '@genfeedai/helpers';
import { readRecordOrNull } from '@genfeedai/utils/data/extract.util';

/** `request_input` ids of in-flow brand-context asks: `brand_context:<field>`. */
export const BRAND_CONTEXT_ASK_REQUEST_PREFIX = 'brand_context:';

/** `agentConfig` key holding the last in-flow ask per field. */
export const BRAND_CONTEXT_ASKS_CONFIG_KEY = 'brandContextAsks';

/**
 * Highest-value context first: who the posts are for, what they sell and who
 * they compete with change copy the most; the rest refine it.
 */
export const BRAND_CONTEXT_ASK_PRIORITY: readonly OnboardingAnswerFieldId[] = [
  'audience',
  'offer',
  'competitors',
  'goals',
  'platforms',
  'tone',
  'cadence',
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** A field is not asked again within 7 days of its last ask or skip. */
export const BRAND_CONTEXT_FIELD_COOLDOWN_MS = 7 * DAY_MS;

/** A brand gets at most one in-flow ask per 24 hours, across conversations. */
export const BRAND_CONTEXT_BRAND_COOLDOWN_MS = DAY_MS;

const MAX_SUGGESTION_LENGTH = 200;
const MAX_SUGGESTIONS = 4;

/** `computeBrandCompleteness` field key for each onboarding card field. */
const COMPLETENESS_KEYS: Record<OnboardingAnswerFieldId, string> = {
  audience: 'audience',
  cadence: 'frequency',
  competitors: 'competitors',
  goals: 'goals',
  offer: 'offers',
  platforms: 'platforms',
  tone: 'tone',
};

function isWithin(timestamp: string, now: Date, windowMs: number): boolean {
  const time = Date.parse(timestamp);
  return Number.isFinite(time) && now.getTime() - time < windowMs;
}

function readAsk(value: unknown): IBrandContextAsk | undefined {
  const record = readRecordOrNull(value);
  if (
    typeof record?.askedAt !== 'string' ||
    typeof record.threadId !== 'string'
  )
    return undefined;
  return { askedAt: record.askedAt, threadId: record.threadId };
}

/** Reads `agentConfig.brandContextAsks`, dropping unknown or malformed entries. */
export function readBrandContextAsks(agentConfig: unknown): BrandContextAsks {
  const stored = readRecordOrNull(
    readRecordOrNull(agentConfig)?.[BRAND_CONTEXT_ASKS_CONFIG_KEY],
  );
  const asks: BrandContextAsks = {};
  for (const fieldId of ONBOARDING_ANSWER_FIELD_IDS) {
    const ask = readAsk(stored?.[fieldId]);
    if (ask) asks[fieldId] = ask;
  }
  return asks;
}

function readSuggestionList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item && item.length <= MAX_SUGGESTION_LENGTH)
    .slice(0, MAX_SUGGESTIONS);
}

/** Scan suggestions the last URL scan stored on `agentConfig.signupPrefill`. */
export function readStoredScanSuggestions(
  agentConfig: unknown,
): IOnboardingScanSuggestions {
  const prefill = readRecordOrNull(
    readRecordOrNull(agentConfig)?.signupPrefill,
  );
  const suggestions = readRecordOrNull(prefill?.suggestions);
  return {
    audiences: readSuggestionList(suggestions?.audiences),
    competitors: readSuggestionList(suggestions?.competitors),
    offers: readSuggestionList(suggestions?.offers),
  };
}

/** The field a `brand_context:<field>` request id names, or null. */
export function parseBrandContextAskRequestId(
  requestId: string,
): OnboardingAnswerFieldId | null {
  if (!requestId.startsWith(BRAND_CONTEXT_ASK_REQUEST_PREFIX)) return null;
  const field = requestId.slice(BRAND_CONTEXT_ASK_REQUEST_PREFIX.length);
  return ONBOARDING_ANSWER_FIELD_IDS.find((id) => id === field) ?? null;
}

/**
 * True when no in-flow ask may happen now: this conversation already asked
 * one, or the brand was asked anything within the brand cooldown.
 */
function isAskBudgetSpent(
  asks: BrandContextAsks,
  now: Date,
  threadId?: string,
): boolean {
  return Object.values(asks).some(
    (ask) =>
      (threadId !== undefined && ask.threadId === threadId) ||
      isWithin(ask.askedAt, now, BRAND_CONTEXT_BRAND_COOLDOWN_MS),
  );
}

/**
 * The brand fields the agent may ask about right now, highest value first.
 *
 * A field qualifies when the brand still lacks it (brand completeness) and it
 * was neither asked nor skipped within the field cooldown. A skipped field
 * comes back as `skipped` once the cooldown passes, because completeness
 * still counts it as missing. Nothing qualifies once this conversation has
 * asked, or the brand was asked within the brand cooldown.
 */
export function resolveMissingBrandContext(input: {
  brand: { agentConfig?: unknown };
  now: Date;
  threadId?: string;
}): IMissingBrandContext {
  const { agentConfig } = input.brand;
  const suggestions = readStoredScanSuggestions(agentConfig);
  const asks = readBrandContextAsks(agentConfig);
  if (isAskBudgetSpent(asks, input.now, input.threadId))
    return { fields: [], suggestions };

  const incompleteKeys = new Set(
    computeBrandCompleteness(
      input.brand as Parameters<typeof computeBrandCompleteness>[0],
    ).incompleteFields.map((field) => field.key),
  );
  const progress = readOnboardingAnswersProgress(agentConfig);
  const fields: IMissingBrandContextField[] = [];
  for (const fieldId of BRAND_CONTEXT_ASK_PRIORITY) {
    if (!incompleteKeys.has(COMPLETENESS_KEYS[fieldId])) continue;
    const ask = asks[fieldId];
    if (
      ask &&
      isWithin(ask.askedAt, input.now, BRAND_CONTEXT_FIELD_COOLDOWN_MS)
    )
      continue;
    const answer = progress.fields[fieldId];
    const isSkipped = answer?.status === 'skipped';
    if (
      isSkipped &&
      isWithin(answer.updatedAt, input.now, BRAND_CONTEXT_FIELD_COOLDOWN_MS)
    )
      continue;
    fields.push({ field: fieldId, status: isSkipped ? 'skipped' : 'missing' });
  }
  return { fields, suggestions };
}

/**
 * True when every field was asked on a brand-context card in this
 * conversation, the only way an in-flow save may write it.
 */
export function wereFieldsAskedInThread(
  agentConfig: unknown,
  threadId: string,
  fields: readonly OnboardingAnswerFieldId[],
): boolean {
  const asks = readBrandContextAsks(agentConfig);
  return (
    fields.length > 0 &&
    fields.every((fieldId) => asks[fieldId]?.threadId === threadId)
  );
}
