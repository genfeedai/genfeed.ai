import type { BrandAgentVoice } from '@api/collections/brands/schemas/brand.schema';
import type { ExpertPositioningAnswers } from '@genfeedai/contracts/constants';
import type {
  IExpertPositioningScore,
  IHarnessProfileThesis,
} from '@genfeedai/contracts/interfaces';

export const EXPERT_HARNESS_DRAFT_SOURCE = 'expert-positioning';

/**
 * Phrases that make an expert sound like every other expert. Seeded as banned
 * phrases so generated drafts start from the expert's words, not the genre's.
 */
export const EXPERT_GENERIC_BANNED_PHRASES = [
  'game-changer',
  'unlock your potential',
  "in today's fast-paced world",
  'level up',
  'take it to the next level',
  'secret sauce',
] as const;

const VOCABULARY_STOPWORDS = new Set([
  'about',
  'actually',
  'after',
  'again',
  'because',
  'before',
  'being',
  'believe',
  'people',
  'really',
  'should',
  'something',
  'their',
  'there',
  'these',
  'thing',
  'things',
  'think',
  'those',
  'through',
  'where',
  'which',
  'while',
  'would',
]);

const VOCABULARY_LIMIT = 8;

export interface ExpertHarnessDraftInput {
  answers: ExpertPositioningAnswers;
  brandId: string;
  brandLabel: string;
  platforms: string[];
  score: IExpertPositioningScore;
  voice: Partial<BrandAgentVoice>;
  generatedAt?: Date;
}

export interface ExpertHarnessDraft {
  audience: string[];
  brandId: string;
  description: string;
  guardrails: string[];
  isDefault: true;
  label: string;
  metadata: Record<string, unknown>;
  platforms: string[];
  positioning: IExpertPositioningScore;
  scope: 'founder';
  status: 'active';
  thesis: IHarnessProfileThesis;
  voice: {
    bannedPhrases: string[];
    stance: string;
    style?: string;
    tone?: string;
    vocabulary: string[];
  };
}

/** Split a free-text answer into trimmed lines / sentences for list fields. */
export function splitAnswerItems(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  const lines = value
    .split(/\n+/)
    .map((line) => line.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(Boolean);

  const items =
    lines.length > 1
      ? lines
      : value
          .split(/(?<=[.!?;])\s+/)
          .map((sentence) => sentence.trim())
          .filter(Boolean);

  return Array.from(new Set(items));
}

function singleItem(value: string | undefined): string[] {
  const trimmed = value?.trim();
  return trimmed ? [trimmed] : [];
}

function readList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

/**
 * Words the expert repeats across answers are their native vocabulary.
 * Deterministic: frequency first, then first appearance.
 */
export function extractExpertVocabulary(
  answers: ExpertPositioningAnswers,
): string[] {
  const counts = new Map<string, { count: number; firstIndex: number }>();
  const words = Object.values(answers)
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase()
    .match(/[a-z][a-z'-]{5,}/g);

  (words ?? []).forEach((word, index) => {
    if (VOCABULARY_STOPWORDS.has(word)) {
      return;
    }
    const existing = counts.get(word);
    counts.set(word, {
      count: (existing?.count ?? 0) + 1,
      firstIndex: existing?.firstIndex ?? index,
    });
  });

  return Array.from(counts.entries())
    .filter(([, entry]) => entry.count >= 2)
    .sort(
      ([, left], [, right]) =>
        right.count - left.count || left.firstIndex - right.firstIndex,
    )
    .slice(0, VOCABULARY_LIMIT)
    .map(([word]) => word);
}

function buildStance(answers: ExpertPositioningAnswers): string {
  const domino = answers.bigDomino?.trim();
  return domino
    ? `First-person practitioner. Teach from lived experience and proof, and make every post ladder to one belief: ${domino}`
    : 'First-person practitioner. Teach from lived experience and proof, and take a clear position.';
}

/**
 * Map positioning answers plus the brand's interview voice onto a harness
 * profile payload. Pure — persistence and merge semantics live in
 * `HarnessProfilesService.upsertPositioningDraftForBrand`.
 */
export function buildExpertHarnessDraft(
  input: ExpertHarnessDraftInput,
): ExpertHarnessDraft {
  const { answers, voice } = input;
  const contrarian = splitAnswerItems(answers.contrarianBeliefs);
  const notFor = splitAnswerItems(answers.notForWho);

  return {
    audience: readList(voice.audience),
    brandId: input.brandId,
    description: `${input.brandLabel} positioning, generated from the Expert Path interview.`,
    guardrails: [
      'Never invent credentials, client names, results, or numbers beyond the listed proof points.',
      ...notFor.map((item) => `Not written for: ${item}`),
    ],
    isDefault: true,
    label: `${input.brandLabel} expert voice`,
    metadata: {
      generatedAt: (input.generatedAt ?? new Date()).toISOString(),
      source: EXPERT_HARNESS_DRAFT_SOURCE,
    },
    platforms: input.platforms,
    positioning: input.score,
    scope: 'founder',
    status: 'active',
    thesis: {
      beliefs: Array.from(
        new Set([
          ...singleItem(answers.bigDomino),
          ...readList(voice.messagingPillars),
        ]),
      ),
      bigDomino: singleItem(answers.bigDomino),
      enemies: contrarian,
      newOpportunity: singleItem(answers.newOpportunity),
      notFor,
      originStory: singleItem(answers.originStory),
      proofPoints: splitAnswerItems(answers.authoritySignals),
      transformation: singleItem(answers.transformation),
    },
    voice: {
      bannedPhrases: Array.from(
        new Set([
          ...readList(voice.doNotSoundLike),
          ...readList(voice.bannedPhrases),
          ...EXPERT_GENERIC_BANNED_PHRASES,
        ]),
      ),
      stance: buildStance(answers),
      ...(typeof voice.style === 'string' && voice.style.trim()
        ? { style: voice.style.trim() }
        : {}),
      ...(typeof voice.tone === 'string' && voice.tone.trim()
        ? { tone: voice.tone.trim() }
        : {}),
      vocabulary: extractExpertVocabulary(answers),
    },
  };
}
