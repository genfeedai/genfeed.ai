import {
  buildVoiceCorpus,
  pickRepresentativeExemplars,
  resolveVerbatimExemplars,
} from '@api/collections/brands/utils/brand-voice-corpus.util';
import { deriveVoiceWritingRules } from '@api/collections/brands/utils/brand-voice-stylometrics.util';
import {
  type BrandPromptIntent,
  BrandVoiceFailureCode,
  type IBrandAgentPrompting,
  type IBrandPromptSeed,
  type IBrandVoiceCorpus,
  type IBrandVoiceSample,
  type IGeneratedBrandProfile,
} from '@genfeedai/contracts/interfaces';

/**
 * Provider output that does not satisfy the brand-profile contract. Carries
 * the public failure code and the missing field names only — never the raw
 * payload — so callers can map it to a bounded, redacted API error.
 */
export class BrandVoiceValidationError extends Error {
  /**
   * @param code Public classification of what was wrong with the output.
   * @param missingFields Contract field names absent from the output; only
   *   populated for `INCOMPLETE_PROFILE`.
   */
  constructor(
    public readonly code: BrandVoiceFailureCode,
    public readonly missingFields: string[] = [],
  ) {
    super(
      code === BrandVoiceFailureCode.INCOMPLETE_PROFILE
        ? `Brand profile response is missing ${missingFields.join(', ')}.`
        : `Brand profile response is invalid: ${code}.`,
    );
    this.name = 'BrandVoiceValidationError';
  }
}

const ALLOWED_PROMPT_FORMATS = new Set([
  'article',
  'carousel',
  'image',
  'post',
  'short-video',
  'video',
]);
const MAX_CONTEXT_LIST_ITEMS = 6;
const MAX_PROFILE_TEXT_LENGTH = 200;
const STARTER_LABEL_MAX_LENGTH = 32;
const STARTER_PROMPT_MAX_LENGTH = 220;
const MAX_EXEMPLARS = 8;
const MAX_FALLBACK_EXEMPLARS = 6;
const MAX_MODEL_WRITING_RULES = 6;
const MAX_WRITING_RULES = 16;

const PROFILE_OUTPUT_CONTRACT = `Return one JSON object with these exact fields:
- tone: a short phrase
- style: a short phrase
- audience: 2-4 audience segments
- values: 3-5 core values
- taglines: 0-3 short taglines
- hashtags: 0-5 brand-safe hashtags
- messagingPillars: 3-5 recurring messaging pillars
- doNotSoundLike: 2-5 tones, phrases, or styles to avoid
- sampleOutput: one short example paragraph in the brand voice
- topics: 3-6 canonical content topics grounded in the supplied brand information
- goals: 1-4 measurable content or business goals grounded in the supplied brand information
- promptSeeds: exactly 6 objects with topic, angle, audience, and preferredFormats

Each prompt seed must use a topic from topics or messagingPillars. preferredFormats may only contain article, carousel, image, post, short-video, or video. Do not invent products, platforms, proof, performance data, or campaigns.`;

const VOICE_EVIDENCE_OUTPUT_CONTRACT = `Also include these fields, because real posts are supplied below:
- exemplarIds: the [numbers] of 4-8 real posts that best capture the voice, mixing replies and original posts
- writingRules: 3-6 short, concrete rules the real posts evidence (how replies open, how they disagree, what they never do); do not restate the measured statistics`;

/**
 * Builds the profile prompt. When `voiceEvidence` (the brand's own posts and
 * their measured style) is supplied, tone, style, and sample output must be
 * described from that evidence, and exemplars are picked by number from it.
 */
export function buildBrandProfileAnalysisPrompt(
  brandContext: string,
  voiceEvidence?: string,
): string {
  const contract = voiceEvidence
    ? `${PROFILE_OUTPUT_CONTRACT}\n\n${VOICE_EVIDENCE_OUTPUT_CONTRACT}`
    : PROFILE_OUTPUT_CONTRACT;
  const evidence = voiceEvidence ? `\n\n${voiceEvidence}` : '';

  return `You are a brand strategist. Build a reusable brand profile for content creation and AI prompt personalization.

${contract}

Brand information:
${brandContext}${evidence}

Respond only with the JSON object. Do not include markdown or commentary.`;
}

function readExemplarIds(value: unknown): number[] {
  const items = Array.isArray(value) ? value : [];
  return items.flatMap((item) => {
    const parsed =
      typeof item === 'number'
        ? item
        : typeof item === 'string'
          ? Number.parseInt(item.replace(/[^0-9]/g, ''), 10)
          : Number.NaN;
    return Number.isInteger(parsed) ? [parsed] : [];
  });
}

function readRawStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function dedupeRules(rules: readonly string[], limit: number): string[] {
  const seen = new Set<string>();
  return rules.flatMap((rule) => {
    const normalized = rule.trim().replace(/\s+/g, ' ');
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key) || seen.size >= limit) {
      return [];
    }
    seen.add(key);
    return [normalized];
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampText(value: string, maxLength: number): string {
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLength).trim();
}

function readString(
  value: unknown,
  maxLength: number = MAX_PROFILE_TEXT_LENGTH,
): string {
  return typeof value === 'string' ? clampText(value, maxLength) : '';
}

function readStringList(
  value: unknown,
  limit: number = MAX_CONTEXT_LIST_ITEMS,
): string[] {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set<string>();

  return items.flatMap((item) => {
    const normalized = readString(item);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key) || seen.size >= limit) {
      return [];
    }
    seen.add(key);
    return [normalized];
  });
}

/**
 * Extracts the profile object from raw model output. Models sometimes wrap
 * the object in markdown fences, prose, or a single-element array, so the
 * outermost `{...}` span is parsed rather than the whole string; the result
 * is still field-validated by `parseGeneratedBrandProfile`, so recovery
 * never admits an incomplete profile. Output with no parseable object is
 * classified, never echoed.
 */
function parseJsonObject(content: string): Record<string, unknown> {
  if (!content.trim()) {
    throw new BrandVoiceValidationError(BrandVoiceFailureCode.EMPTY_OUTPUT);
  }

  const match = content.match(/\{[\s\S]*\}/);
  let parsed: unknown;
  try {
    parsed = JSON.parse(match?.[0] ?? content);
  } catch {
    throw new BrandVoiceValidationError(BrandVoiceFailureCode.MALFORMED_OUTPUT);
  }

  const record = asRecord(parsed);
  if (!record) {
    throw new BrandVoiceValidationError(
      BrandVoiceFailureCode.UNEXPECTED_OUTPUT_SHAPE,
    );
  }
  return record;
}

function normalizeSeed(
  value: unknown,
  allowedTopics: string[],
  fallbackAudience: string,
): IBrandPromptSeed | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const requestedTopic = readString(record.topic);
  const topic = allowedTopics.find(
    (candidate) => candidate.toLowerCase() === requestedTopic.toLowerCase(),
  );
  if (!topic) {
    return null;
  }

  const preferredFormats = readStringList(record.preferredFormats, 3).filter(
    (format) => ALLOWED_PROMPT_FORMATS.has(format.toLowerCase()),
  );

  return {
    angle: readString(record.angle) || 'Practical guidance',
    audience: readString(record.audience) || fallbackAudience,
    preferredFormats: preferredFormats.length > 0 ? preferredFormats : ['post'],
    topic,
  };
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function buildStarter(
  intent: BrandPromptIntent,
  seed: IBrandPromptSeed,
  tone: string,
): IBrandAgentPrompting['conversationStarters'][number] {
  const topic = seed.topic;
  const audience = seed.audience;
  const angle = seed.angle.toLowerCase();
  const preferredFormat = seed.preferredFormats[0] ?? 'post';
  const verb =
    intent === 'create' ? 'Create' : intent === 'plan' ? 'Plan' : 'Analyze';
  const label = clampText(`${verb} ${topic}`, STARTER_LABEL_MAX_LENGTH);
  const prompt =
    intent === 'create'
      ? `Create three ${tone} ${preferredFormat} ideas about ${topic} for ${audience}, using a ${angle} angle.`
      : intent === 'plan'
        ? `Plan a week of content about ${topic} for ${audience}, using our ${tone} voice and a ${angle} angle.`
        : `Analyze our recent content about ${topic} and recommend what to repeat for ${audience}, aligned with our ${tone} voice.`;

  return {
    id: `brand-${intent}-${slugify(topic) || intent}`,
    intent,
    label,
    prompt: clampText(prompt, STARTER_PROMPT_MAX_LENGTH),
    topic,
  };
}

function buildPrompting(
  rawSeeds: unknown,
  topics: string[],
  audience: string[],
  tone: string,
): IBrandAgentPrompting {
  const fallbackAudience = audience[0] ?? 'the brand audience';
  const parsedSeeds = Array.isArray(rawSeeds)
    ? rawSeeds.flatMap((seed) => {
        const normalized = normalizeSeed(seed, topics, fallbackAudience);
        return normalized ? [normalized] : [];
      })
    : [];
  const seenTopics = new Set(parsedSeeds.map((seed) => seed.topic));
  const fallbackSeeds = topics
    .filter((topic) => !seenTopics.has(topic))
    .map<IBrandPromptSeed>((topic) => ({
      angle: 'Practical guidance',
      audience: fallbackAudience,
      preferredFormats: ['post'],
      topic,
    }));
  const seeds = [...parsedSeeds, ...fallbackSeeds].slice(
    0,
    MAX_CONTEXT_LIST_ITEMS,
  );

  while (seeds.length < MAX_CONTEXT_LIST_ITEMS) {
    const topic = topics[seeds.length % topics.length];
    if (!topic) {
      throw new Error('Brand profile prompt seeds require at least one topic.');
    }
    seeds.push({
      angle: 'Practical guidance',
      audience: fallbackAudience,
      preferredFormats: ['post'],
      topic,
    });
  }

  const intents: BrandPromptIntent[] = ['create', 'plan', 'analyze'];
  return {
    conversationStarters: intents.map((intent, index) => {
      const seed = seeds[index % seeds.length];
      if (!seed) {
        throw new Error(
          'Brand profile conversation starters require prompt seeds.',
        );
      }
      return buildStarter(intent, seed, tone);
    }),
    seeds,
  };
}

/**
 * Validates raw model output against the brand-profile contract and returns
 * the normalized profile. Throws `BrandVoiceValidationError` (classified,
 * payload-free) for empty, malformed, non-object, or incomplete output.
 *
 * Exemplars are resolved against `promptSamples` (the numbered real posts the
 * model saw) and always come back as stored corpus text, never model text.
 * Writing rules are the measured-style rules followed by the model's
 * evidence-backed rules; with no corpus the model's rules are ignored.
 */
export function parseGeneratedBrandProfile(
  content: string,
  corpus: IBrandVoiceCorpus = buildVoiceCorpus([]),
  promptSamples: readonly IBrandVoiceSample[] = [],
): IGeneratedBrandProfile {
  const record = parseJsonObject(content);
  const tone = readString(record.tone);
  const style = readString(record.style ?? record.voice);
  const audience = readStringList(record.audience, 4);
  const messagingPillars = readStringList(record.messagingPillars, 5);
  const topics = readStringList(record.topics, 6);
  const canonicalTopics = topics.length > 0 ? topics : messagingPillars;

  const missingFields = [
    !tone && 'tone',
    !style && 'style',
    audience.length === 0 && 'audience',
    canonicalTopics.length === 0 && 'topics',
  ].filter((field): field is string => typeof field === 'string');

  if (missingFields.length > 0) {
    throw new BrandVoiceValidationError(
      BrandVoiceFailureCode.INCOMPLETE_PROFILE,
      missingFields,
    );
  }

  const hasEvidence = corpus.samples.length > 0;
  const pickedExemplars = hasEvidence
    ? resolveVerbatimExemplars(
        {
          ids: readExemplarIds(record.exemplarIds),
          texts: readRawStrings(record.exemplarTexts),
        },
        promptSamples,
        MAX_EXEMPLARS,
      )
    : [];
  const exemplarTexts =
    pickedExemplars.length > 0
      ? pickedExemplars
      : pickRepresentativeExemplars(corpus.samples, MAX_FALLBACK_EXEMPLARS);
  const writingRules = dedupeRules(
    [
      ...deriveVoiceWritingRules(corpus.stylometrics),
      ...(hasEvidence
        ? readStringList(record.writingRules, MAX_MODEL_WRITING_RULES)
        : []),
    ],
    MAX_WRITING_RULES,
  );

  return {
    audience,
    corpus: corpus.summary,
    doNotSoundLike: readStringList(record.doNotSoundLike, 5),
    exemplarTexts,
    hashtags: readStringList(record.hashtags, 5),
    messagingPillars:
      messagingPillars.length > 0 ? messagingPillars : canonicalTopics,
    prompting: buildPrompting(
      record.promptSeeds ?? record.seeds,
      canonicalTopics,
      audience,
      tone,
    ),
    sampleOutput: readString(record.sampleOutput, 1000),
    strategy: {
      goals: readStringList(record.goals, 4),
      topics: canonicalTopics,
    },
    style,
    taglines: readStringList(record.taglines, 3),
    tone,
    values: readStringList(record.values, 5),
    writingRules,
  };
}
