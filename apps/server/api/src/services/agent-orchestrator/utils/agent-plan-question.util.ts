import type { PlanModeQuestion } from '@api/services/agent-orchestrator/interfaces/agent-orchestrator-plan-mode.interface';
import type { AgentInputRequestOption } from '@genfeedai/contracts/interfaces/ai/agent-input-request.interface';

/** Questions the planner may ask in a row before it must plan with assumptions. */
export const MAX_PLAN_QUESTION_ROUNDS = 3;

const MAX_PLAN_QUESTION_OPTIONS = 5;

/** Metadata key that marks an assistant message as a plan-mode question. */
export const PLAN_QUESTION_METADATA_KEY = 'planQuestionRequestId';

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readOptions(value: unknown): AgentInputRequestOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: AgentInputRequestOption[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const record = entry as Record<string, unknown>;
    const id = readText(record.id);
    const label = readText(record.label);
    if (!id || !label) return null;
    const description = readText(record.description);
    options.push({ id, label, ...(description ? { description } : {}) });
  }
  if (
    options.length === 0 ||
    options.length > MAX_PLAN_QUESTION_OPTIONS ||
    new Set(options.map((option) => option.id)).size !== options.length
  ) {
    return null;
  }
  return options;
}

/**
 * Reads the planner's `question` field. Returns null for anything that is not
 * a usable card (no prompt, no or too many options, duplicate option ids) so a
 * malformed question never reaches the user as a broken card.
 */
export function parsePlanQuestion(
  parsed: Record<string, unknown> | null,
): PlanModeQuestion | null {
  const raw = parsed?.question;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const prompt = readText(record.prompt);
  const options = readOptions(record.options);
  if (!prompt || !options) return null;
  const recommendedOptionId = readText(record.recommendedOptionId);
  return {
    allowFreeText: record.allowFreeText !== false,
    options,
    prompt,
    ...(recommendedOptionId &&
    options.some((option) => option.id === recommendedOptionId)
      ? { recommendedOptionId }
      : {}),
    title: readText(record.title) ?? 'One question before the plan',
  };
}

/**
 * How many plan questions the user has been asked in a row, counting back from
 * the latest message. A plan or any other assistant reply ends the run, so a
 * later request in the same thread starts with a fresh allowance.
 */
export function countTrailingPlanQuestions(
  messages: ReadonlyArray<{ metadata?: unknown; role?: unknown }>,
): number {
  let count = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'assistant') continue;
    const metadata =
      message.metadata && typeof message.metadata === 'object'
        ? (message.metadata as Record<string, unknown>)
        : {};
    if (typeof metadata[PLAN_QUESTION_METADATA_KEY] !== 'string') break;
    count += 1;
  }
  return count;
}

const MAX_EMBEDDED_JSON_ATTEMPTS = 25;

/**
 * The JSON object a reply ends with, after a sentence or two of prose. The
 * planner is told to answer with JSON only but often opens with a line such as
 * "I'll check your review queue first." Without this the whole reply, braces
 * included, would be posted as an ordinary message.
 */
function findTrailingJsonObject(text: string): string | null {
  if (!text.endsWith('}')) return null;
  let attempts = 0;
  for (
    let start = text.indexOf('{');
    start !== -1 && attempts < MAX_EMBEDDED_JSON_ATTEMPTS;
    start = text.indexOf('{', start + 1)
  ) {
    attempts += 1;
    const slice = text.slice(start);
    try {
      const value: unknown = JSON.parse(slice);
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.keys(value).length > 0
      ) {
        return slice;
      }
    } catch {
      // Not the start of the JSON object; try the next brace.
    }
  }
  return null;
}

/**
 * Splits a planner reply into its text and the JSON object it carries, if any.
 * The model may fence the JSON or put a line of prose before it; a reply that
 * carries no JSON object parses to null.
 */
export function parsePlanResponse(assistantContent: string): {
  candidate: string;
  parsed: Record<string, unknown> | null;
} {
  const trimmed = assistantContent.trim();
  const fencedJsonMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const trailingFenceMatch = fencedJsonMatch
    ? null
    : trimmed.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```$/i);
  let candidate =
    fencedJsonMatch?.[1]?.trim() ?? trailingFenceMatch?.[1]?.trim() ?? trimmed;
  let parsed: Record<string, unknown> | null = null;

  if (candidate.startsWith('{') && candidate.endsWith('}')) {
    try {
      parsed = JSON.parse(candidate) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  } else {
    const embedded = findTrailingJsonObject(candidate);
    if (embedded) {
      candidate = embedded;
      parsed = JSON.parse(embedded) as Record<string, unknown>;
    }
  }

  return { candidate, parsed };
}
