import type {
  TalkingHeadScript,
  TalkingHeadScriptNodeOutput,
  TalkingHeadScriptSegment,
  TalkingHeadScriptSegmentPurpose,
} from '../../../contracts/talking-head-script';
import type { ExecutableNode } from '../../types';
import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '../base-executor';

export const TALKING_HEAD_SCRIPT_LIMITS = {
  clipCount: { max: 20, min: 2 },
  durationSeconds: { max: 300, min: 1 },
  wordsPerSecond: { max: 6, min: 1 },
} as const;

export const DEFAULT_TALKING_HEAD_SCRIPT_DURATION_SECONDS = 30;
export const DEFAULT_TALKING_HEAD_SCRIPT_CLIP_COUNT = 5;
export const DEFAULT_TALKING_HEAD_SCRIPT_WORDS_PER_SECOND = 3.5;
export const DEFAULT_TALKING_HEAD_SCRIPT_LANGUAGE = 'en';

const MIN_COHERENT_WORDS_PER_SEGMENT = 3;
const MAX_GENERATION_ATTEMPTS = 2;
const LANGUAGE_TAG_PATTERN = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

export interface TalkingHeadScriptSegmentBudget {
  clipIndex: number;
  purpose: TalkingHeadScriptSegmentPurpose;
  targetDurationSeconds: number;
  targetWordCount: number;
}

export interface TalkingHeadScriptGenerationRequest {
  brandVoice: string | null;
  harnessContext: string | null;
  language: string;
  model: string | null;
  productContext: string;
  segmentBudgets: TalkingHeadScriptSegmentBudget[];
  totalDurationSeconds: number;
  totalTargetWordCount: number;
  validationError?: string;
  wordsPerSecond: number;
}

export type TalkingHeadScriptResolver = (
  request: TalkingHeadScriptGenerationRequest,
) => Promise<unknown>;

interface TalkingHeadScriptDraftSegment {
  clipIndex: number;
  purpose: TalkingHeadScriptSegmentPurpose;
  text: string;
}

interface TalkingHeadScriptDraft {
  segments: TalkingHeadScriptDraftSegment[];
}

type ResolvedTalkingHeadScriptRequest = Omit<
  TalkingHeadScriptGenerationRequest,
  'validationError'
>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function roundTo(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function ceilTo(value: number, decimalPlaces: number): number {
  const factor = 10 ** decimalPlaces;
  return Math.ceil(value * factor) / factor;
}

function readInputOrConfig(
  input: ExecutorInput,
  key: string,
  fallback: unknown,
): unknown {
  if (input.inputs.has(key)) {
    return input.inputs.get(key);
  }

  return input.node.config[key] ?? fallback;
}

function requireFiniteNumber(
  value: unknown,
  field: string,
  min: number,
  max: number,
): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${field} must be between ${min} and ${max}`);
  }

  return value;
}

function requireClipCount(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < TALKING_HEAD_SCRIPT_LIMITS.clipCount.min ||
    value > TALKING_HEAD_SCRIPT_LIMITS.clipCount.max
  ) {
    throw new Error(
      `clipCount must be an integer between ${TALKING_HEAD_SCRIPT_LIMITS.clipCount.min} and ${TALKING_HEAD_SCRIPT_LIMITS.clipCount.max}`,
    );
  }

  return value;
}

function readRequiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} is required and must be a non-empty string`);
  }

  return value.trim();
}

function readOptionalText(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string when provided`);
  }

  return value.trim();
}

function stringifyObjectContext(value: unknown, field: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'string') {
    return readOptionalText(value, field);
  }

  if (!isRecord(value)) {
    throw new Error(`${field} must be a string or object when provided`);
  }

  try {
    return JSON.stringify(value);
  } catch {
    throw new Error(`${field} must be JSON-serializable`);
  }
}

function extractBrandVoice(value: unknown): string | null {
  if (value === undefined || value === null || typeof value === 'string') {
    return readOptionalText(value, 'brandVoice');
  }

  if (!isRecord(value)) {
    throw new Error('brandVoice must be a string or brand context object');
  }

  for (const key of ['voice', 'voiceConfig', 'brandVoice', 'tone', 'style']) {
    const candidate = value[key];
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
    if (isRecord(candidate)) {
      return stringifyObjectContext(candidate, 'brandVoice');
    }
  }

  return stringifyObjectContext(value, 'brandVoice');
}

function expectedPurpose(
  clipIndex: number,
  clipCount: number,
): TalkingHeadScriptSegmentPurpose {
  if (clipIndex === 0) {
    return 'hook';
  }
  if (clipIndex === clipCount - 1) {
    return 'cta';
  }
  return 'body';
}

function allocateSegmentBudgets(
  totalDurationSeconds: number,
  clipCount: number,
  wordsPerSecond: number,
): TalkingHeadScriptSegmentBudget[] {
  const equalDuration = roundTo(totalDurationSeconds / clipCount, 6);
  const durations = Array.from({ length: clipCount }, (_, clipIndex) =>
    clipIndex === clipCount - 1
      ? roundTo(totalDurationSeconds - equalDuration * (clipCount - 1), 6)
      : equalDuration,
  );

  const budgets = durations.map((targetDurationSeconds, clipIndex) => ({
    clipIndex,
    purpose: expectedPurpose(clipIndex, clipCount),
    targetDurationSeconds,
    targetWordCount: Math.floor(
      targetDurationSeconds * wordsPerSecond + Number.EPSILON,
    ),
  }));

  const undersized = budgets.find(
    (budget) => budget.targetWordCount < MIN_COHERENT_WORDS_PER_SEGMENT,
  );
  if (undersized) {
    const minimumDuration = ceilTo(
      (clipCount * MIN_COHERENT_WORDS_PER_SEGMENT) / wordsPerSecond,
      3,
    );
    throw new Error(
      `A ${totalDurationSeconds}-second script cannot fit ${clipCount} coherent clips at ${wordsPerSecond} wps. Each clip needs a budget of at least ${MIN_COHERENT_WORDS_PER_SEGMENT} words. Increase duration to at least ${minimumDuration} seconds, reduce clipCount, or increase wordsPerSecond.`,
    );
  }

  return budgets;
}

function resolveRequest(
  input: ExecutorInput,
): ResolvedTalkingHeadScriptRequest {
  const clipCount = requireClipCount(
    readInputOrConfig(
      input,
      'clipCount',
      DEFAULT_TALKING_HEAD_SCRIPT_CLIP_COUNT,
    ),
  );
  const totalDurationSeconds = requireFiniteNumber(
    readInputOrConfig(
      input,
      'durationSeconds',
      DEFAULT_TALKING_HEAD_SCRIPT_DURATION_SECONDS,
    ),
    'durationSeconds',
    TALKING_HEAD_SCRIPT_LIMITS.durationSeconds.min,
    TALKING_HEAD_SCRIPT_LIMITS.durationSeconds.max,
  );
  const wordsPerSecond = requireFiniteNumber(
    readInputOrConfig(
      input,
      'wordsPerSecond',
      DEFAULT_TALKING_HEAD_SCRIPT_WORDS_PER_SECOND,
    ),
    'wordsPerSecond',
    TALKING_HEAD_SCRIPT_LIMITS.wordsPerSecond.min,
    TALKING_HEAD_SCRIPT_LIMITS.wordsPerSecond.max,
  );
  const language = readRequiredText(
    readInputOrConfig(input, 'language', DEFAULT_TALKING_HEAD_SCRIPT_LANGUAGE),
    'language',
  );
  if (!LANGUAGE_TAG_PATTERN.test(language)) {
    throw new Error(
      'language must be a BCP 47 language tag such as "en" or "en-GB"',
    );
  }

  const productContext = readRequiredText(
    readInputOrConfig(input, 'productContext', undefined),
    'productContext',
  );
  const brandValue = input.inputs.has('brandVoice')
    ? input.inputs.get('brandVoice')
    : input.inputs.has('brand')
      ? input.inputs.get('brand')
      : (input.node.config.brandVoice ?? input.node.config.brandContext);
  const harnessValue = readInputOrConfig(input, 'harnessContext', null);
  const segmentBudgets = allocateSegmentBudgets(
    totalDurationSeconds,
    clipCount,
    wordsPerSecond,
  );

  return {
    brandVoice: extractBrandVoice(brandValue),
    harnessContext: stringifyObjectContext(harnessValue, 'harnessContext'),
    language,
    model: readOptionalText(input.node.config.model, 'model'),
    productContext,
    segmentBudgets,
    totalDurationSeconds,
    totalTargetWordCount: segmentBudgets.reduce(
      (total, budget) => total + budget.targetWordCount,
      0,
    ),
    wordsPerSecond,
  };
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  path: string,
): void {
  const unexpected = Object.keys(value).find(
    (key) => !allowedKeys.includes(key),
  );
  if (unexpected) {
    throw new Error(`Unexpected field "${unexpected}" at ${path}`);
  }
}

function parseDraftJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Structured script payload is empty');
  }
  if (trimmed.startsWith('```')) {
    throw new Error(
      'Structured script payload must be raw JSON without markdown fences',
    );
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new Error('Structured script payload is not valid JSON');
  }
}

function parseDraft(
  value: unknown,
  budgets: TalkingHeadScriptSegmentBudget[],
): TalkingHeadScriptDraft {
  const parsed = parseDraftJson(value);
  if (!isRecord(parsed)) {
    throw new Error('Structured script payload must be an object');
  }
  assertExactKeys(parsed, ['segments'], 'script');

  if (!Array.isArray(parsed.segments)) {
    throw new Error('script.segments must be an array');
  }
  if (parsed.segments.length !== budgets.length) {
    throw new Error(
      `script.segments must contain exactly ${budgets.length} segments; received ${parsed.segments.length}`,
    );
  }

  const segments = parsed.segments.map((candidate, clipIndex) => {
    if (!isRecord(candidate)) {
      throw new Error(`Segment ${clipIndex} must be an object`);
    }
    assertExactKeys(
      candidate,
      ['clipIndex', 'purpose', 'text'],
      `segment ${clipIndex}`,
    );

    if (candidate.clipIndex !== clipIndex) {
      throw new Error(
        `Segment ${clipIndex} must have clipIndex ${clipIndex}; received ${String(candidate.clipIndex)}`,
      );
    }
    const budget = budgets[clipIndex];
    if (!budget) {
      throw new Error(`Missing deterministic budget for segment ${clipIndex}`);
    }
    const expected = budget.purpose;
    if (candidate.purpose !== expected) {
      throw new Error(
        `Segment ${clipIndex} must have purpose "${expected}"; received "${String(candidate.purpose)}"`,
      );
    }
    const text = readRequiredText(candidate.text, `Segment ${clipIndex} text`);

    return {
      clipIndex,
      purpose: expected,
      text,
    } satisfies TalkingHeadScriptDraftSegment;
  });

  return { segments };
}

export function countTalkingHeadScriptWords(text: string): number {
  return text
    .trim()
    .split(/\s+/u)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function buildTimedScript(
  draft: TalkingHeadScriptDraft,
  request: ResolvedTalkingHeadScriptRequest,
): TalkingHeadScript {
  const segments: TalkingHeadScriptSegment[] = draft.segments.map(
    (segment, clipIndex) => {
      const budget = request.segmentBudgets[clipIndex];
      if (!budget) {
        throw new Error(
          `Missing deterministic budget for segment ${clipIndex}`,
        );
      }
      const actualWordCount = countTalkingHeadScriptWords(segment.text);
      if (actualWordCount < MIN_COHERENT_WORDS_PER_SEGMENT) {
        throw new Error(
          `Segment ${clipIndex} has ${actualWordCount} words; write at least ${MIN_COHERENT_WORDS_PER_SEGMENT} words for a coherent clip.`,
        );
      }
      if (actualWordCount > budget.targetWordCount) {
        const excess = actualWordCount - budget.targetWordCount;
        throw new Error(
          `Segment ${clipIndex} has ${actualWordCount} words but its ${budget.targetDurationSeconds}-second budget at ${request.wordsPerSecond} wps allows ${budget.targetWordCount}. Shorten it by at least ${excess} ${excess === 1 ? 'word' : 'words'}.`,
        );
      }

      return {
        ...segment,
        actualWordCount,
        targetDurationSeconds: budget.targetDurationSeconds,
        targetWordCount: budget.targetWordCount,
      };
    },
  );

  return {
    clipCount: segments.length,
    language: request.language,
    segments,
    totalDurationSeconds: request.totalDurationSeconds,
    totalTargetWordCount: request.totalTargetWordCount,
    totalWordCount: segments.reduce(
      (total, segment) => total + segment.actualWordCount,
      0,
    ),
    wordsPerSecond: request.wordsPerSecond,
  };
}

export class TalkingHeadScriptExecutor extends BaseExecutor {
  readonly nodeType = 'talkingHeadScript';
  private resolver: TalkingHeadScriptResolver | null = null;

  setResolver(resolver: TalkingHeadScriptResolver): void {
    this.resolver = resolver;
  }

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const errors = [...super.validate(node).errors];
    try {
      resolveRequest({
        context: {
          organizationId: '',
          runId: '',
          userId: '',
          workflowId: '',
        },
        inputs: new Map(),
        node,
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 3;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    if (!this.resolver) {
      throw new Error(
        'Talking-head script generation resolver is not configured',
      );
    }

    const request = resolveRequest(input);
    let validationError: string | undefined;

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt += 1) {
      try {
        const raw = await this.resolver({ ...request, validationError });
        const draft = parseDraft(raw, request.segmentBudgets);
        const script = buildTimedScript(draft, request);
        const output: TalkingHeadScriptNodeOutput = {
          clipCount: script.clipCount,
          fullText: script.segments.map((segment) => segment.text).join('\n\n'),
          script,
          segments: script.segments,
          totalDurationSeconds: script.totalDurationSeconds,
          totalTargetWordCount: script.totalTargetWordCount,
          totalWordCount: script.totalWordCount,
          wordsPerSecond: script.wordsPerSecond,
        };

        return {
          data: output,
          metadata: {
            clipCount: script.segments.length,
            language: script.language,
            totalDurationSeconds: script.totalDurationSeconds,
            totalTargetWordCount: script.totalTargetWordCount,
            totalWordCount: script.totalWordCount,
            wordsPerSecond: script.wordsPerSecond,
          },
        };
      } catch (error) {
        validationError =
          error instanceof Error ? error.message : String(error);
      }
    }

    throw new Error(
      `Talking-head script generation failed after ${MAX_GENERATION_ATTEMPTS} attempts: ${validationError ?? 'unknown structured-output error'}`,
    );
  }
}
