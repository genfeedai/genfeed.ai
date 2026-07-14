import type {
  BrandPromptIntent,
  IBrandAgentPrompting,
  IBrandPromptSeed,
  IGeneratedBrandProfile,
} from '@genfeedai/interfaces';

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

export function buildBrandProfileAnalysisPrompt(brandContext: string): string {
  return `You are a brand strategist. Build a reusable brand profile for content creation and AI prompt personalization.

${PROFILE_OUTPUT_CONTRACT}

Brand information:
${brandContext}

Respond only with the JSON object. Do not include markdown or commentary.`;
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

function parseJsonObject(content: string): Record<string, unknown> {
  const match = content.match(/\{[\s\S]*\}/);
  const parsed = JSON.parse(match?.[0] ?? content) as unknown;
  const record = asRecord(parsed);
  if (!record) {
    throw new Error('Brand profile response must be a JSON object.');
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

export function parseGeneratedBrandProfile(
  content: string,
): IGeneratedBrandProfile {
  const record = parseJsonObject(content);
  const tone = readString(record.tone);
  const style = readString(record.style ?? record.voice);
  const audience = readStringList(record.audience, 4);
  const messagingPillars = readStringList(record.messagingPillars, 5);
  const topics = readStringList(record.topics, 6);
  const canonicalTopics = topics.length > 0 ? topics : messagingPillars;

  if (
    !tone ||
    !style ||
    audience.length === 0 ||
    canonicalTopics.length === 0
  ) {
    throw new Error(
      'Brand profile response is missing tone, style, audience, or topics.',
    );
  }

  return {
    audience,
    doNotSoundLike: readStringList(record.doNotSoundLike, 5),
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
  };
}
