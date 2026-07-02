import {
  BaseExecutor,
  type ExecutorInput,
  type ExecutorOutput,
} from '@workflow-engine/executors/base-executor';
import type { ExecutableNode } from '@workflow-engine/types';

export type HookFormula =
  | 'person_conflict_resolution'
  | 'curiosity_gap'
  | 'list_reveal'
  | 'transformation'
  | 'challenge';

export type HookToneStyle =
  | 'storytelling'
  | 'provocative'
  | 'educational'
  | 'humorous'
  | 'dramatic';

export interface HookGeneratorConfig {
  niche?: string | null;
  product?: string | null;
  hookFormula?: HookFormula;
  toneStyle?: HookToneStyle;
  inputTrendData?: string | null;
  inputBrandContext?: string | null;
}

export interface HookGeneratorOutput {
  hookText: string;
  captionHook: string;
  hashtags: string[];
  slidePrompts: string[];
}

interface HookContext {
  brandContext: string | null;
  niche: string;
  product: string | null;
  topic: string;
  trendContext: string | null;
}

const DEFAULT_HOOK_FORMULA: HookFormula = 'curiosity_gap';
const DEFAULT_TONE_STYLE: HookToneStyle = 'storytelling';
const DEFAULT_TOPIC = 'your next content idea';
const SLIDE_PROMPT_COUNT = 6;
const MAX_HASHTAG_COUNT = 5;

const VALID_FORMULAS = new Set<HookFormula>([
  'person_conflict_resolution',
  'curiosity_gap',
  'list_reveal',
  'transformation',
  'challenge',
]);

const VALID_TONE_STYLES = new Set<HookToneStyle>([
  'storytelling',
  'provocative',
  'educational',
  'humorous',
  'dramatic',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function stringifyContext(value: unknown): string | null {
  const text = toNonEmptyString(value);
  if (text) {
    return text;
  }

  if (!isRecord(value)) {
    return null;
  }

  const preferredKeys = [
    'topic',
    'matchedKeyword',
    'trend',
    'summary',
    'voice',
    'brandVoice',
    'label',
    'name',
  ];

  for (const key of preferredKeys) {
    const candidate = toNonEmptyString(value[key]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function buildHashtag(value: string): string | null {
  const normalized = value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return normalized.length > 0 ? `#${normalized}` : null;
}

function collectHashtags(
  trendInput: unknown,
  niche: string,
  product: string | null,
): string[] {
  const tags: string[] = [];

  if (isRecord(trendInput) && Array.isArray(trendInput.hashtags)) {
    for (const hashtag of trendInput.hashtags) {
      const tag = toNonEmptyString(hashtag);
      if (tag) {
        tags.push(tag);
      }
    }
  }

  const trendText = stringifyContext(trendInput);
  if (trendText) {
    const matches = trendText.match(/#[a-zA-Z0-9_]+/g) ?? [];
    tags.push(...matches);
  }

  tags.push(niche);
  if (product) {
    tags.push(product);
  }
  tags.push('content');
  tags.push('creator');

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const tag of tags) {
    const hashtag = buildHashtag(tag);
    if (!hashtag || seen.has(hashtag)) {
      continue;
    }

    seen.add(hashtag);
    normalized.push(hashtag);

    if (normalized.length >= MAX_HASHTAG_COUNT) {
      break;
    }
  }

  return normalized;
}

function resolveHookContext(
  node: ExecutableNode,
  inputs: Map<string, unknown>,
): HookContext {
  const config = node.config as HookGeneratorConfig;
  const trendInput = inputs.get('trendData') ?? config.inputTrendData;
  const brandInput = inputs.get('brand') ?? config.inputBrandContext;
  const trendContext = stringifyContext(trendInput);
  const brandContext = stringifyContext(brandInput);
  const product = toNonEmptyString(config.product);
  const niche = toNonEmptyString(config.niche) ?? trendContext ?? DEFAULT_TOPIC;

  return {
    brandContext,
    niche,
    product,
    topic: product ?? niche,
    trendContext,
  };
}

function createFormulaHook(formula: HookFormula, context: HookContext): string {
  const topic = context.topic;
  const audience = context.niche;

  switch (formula) {
    case 'person_conflict_resolution':
      return `${audience} hit a wall with ${topic}, then this fixed it`;
    case 'curiosity_gap':
      return `I tried ${topic} and the result was not what anyone expected`;
    case 'list_reveal':
      return `5 ${topic} lessons creators keep learning too late`;
    case 'transformation':
      return `Before vs after: turning ${topic} into repeatable growth`;
    case 'challenge':
      return `Can ${topic} actually perform when the pressure is real?`;
  }
}

function applyTone(hook: string, toneStyle: HookToneStyle): string {
  switch (toneStyle) {
    case 'storytelling':
      return hook;
    case 'provocative':
      return `Stop ignoring this: ${hook}`;
    case 'educational':
      return `Here is what matters: ${hook}`;
    case 'humorous':
      return `This sounded ridiculous until it worked: ${hook}`;
    case 'dramatic':
      return `The moment everything changed: ${hook}`;
  }
}

function createCaptionHook(hookText: string, context: HookContext): string {
  const details = [context.trendContext, context.brandContext]
    .flatMap((value) => (value ? [value] : []))
    .slice(0, 2);

  if (details.length === 0) {
    return hookText;
  }

  return `${hookText}. ${details.join(' ')}`;
}

function createSlidePrompts(context: HookContext): string[] {
  const brandClause = context.brandContext
    ? ` with ${context.brandContext} brand cues`
    : '';
  const trendClause = context.trendContext
    ? ` referencing ${context.trendContext}`
    : '';

  return [
    `Opening slide visual for ${context.topic}${brandClause}${trendClause}`,
    `Problem scene showing why ${context.niche} needs a better answer`,
    `Discovery moment that reveals the key insight behind ${context.topic}`,
    `Proof slide with a concrete example of ${context.topic} working`,
    `Outcome slide showing the transformation for ${context.niche}`,
    `Final call-to-action slide inviting viewers to try ${context.topic}`,
  ].slice(0, SLIDE_PROMPT_COUNT);
}

export class HookGeneratorExecutor extends BaseExecutor {
  readonly nodeType = 'hookGenerator';

  validate(node: ExecutableNode): { valid: boolean; errors: string[] } {
    const baseValidation = super.validate(node);
    const errors = [...baseValidation.errors];
    const config = node.config as HookGeneratorConfig;

    if (
      config.hookFormula !== undefined &&
      !VALID_FORMULAS.has(config.hookFormula)
    ) {
      errors.push(
        'Invalid hookFormula. Must be one of: person_conflict_resolution, curiosity_gap, list_reveal, transformation, challenge',
      );
    }

    if (
      config.toneStyle !== undefined &&
      !VALID_TONE_STYLES.has(config.toneStyle)
    ) {
      errors.push(
        'Invalid toneStyle. Must be one of: storytelling, provocative, educational, humorous, dramatic',
      );
    }

    for (const field of ['niche', 'product'] as const) {
      const value = config[field];
      if (
        value !== undefined &&
        value !== null &&
        (typeof value !== 'string' || value.trim().length === 0)
      ) {
        errors.push(`${field} must be a non-empty string when provided`);
      }
    }

    return { errors, valid: errors.length === 0 };
  }

  estimateCost(_node: ExecutableNode): number {
    return 1;
  }

  async execute(input: ExecutorInput): Promise<ExecutorOutput> {
    const { inputs, node } = input;
    const config = node.config as HookGeneratorConfig;
    const formula = config.hookFormula ?? DEFAULT_HOOK_FORMULA;
    const toneStyle = config.toneStyle ?? DEFAULT_TONE_STYLE;
    const context = resolveHookContext(node, inputs);

    const hookText = applyTone(createFormulaHook(formula, context), toneStyle);
    const output: HookGeneratorOutput = {
      captionHook: createCaptionHook(hookText, context),
      hashtags: collectHashtags(
        inputs.get('trendData') ?? config.inputTrendData,
        context.niche,
        context.product,
      ),
      hookText,
      slidePrompts: createSlidePrompts(context),
    };

    return {
      data: output,
      metadata: {
        formula,
        hashtagCount: output.hashtags.length,
        slidePromptCount: output.slidePrompts.length,
        toneStyle,
      },
    };
  }
}
