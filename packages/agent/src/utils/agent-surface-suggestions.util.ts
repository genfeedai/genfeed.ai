import {
  APP_ROUTES,
  STUDIO_APP_ROUTE_PREFIXES,
} from '@genfeedai/contracts/constants';
import type {
  BrandPromptIntent,
  IBrandAgentConfig,
  IBrandPromptSeed,
} from '@genfeedai/contracts/interfaces';
import { normalizeBrandAudience } from '@genfeedai/helpers/brand-audience.helper';

const WHITESPACE_RUNS_PATTERN = /\s+/g;
const EDGE_PUNCTUATION_PATTERN = /^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu;
const ACRONYM_PATTERN = /^\p{Lu}[\p{Lu}\d]+$/u;

export type AgentPromptSurface =
  | 'analytics'
  | 'automation'
  | 'calendar'
  | 'conversation'
  | 'discovery'
  | 'library'
  | 'review'
  | 'studio';

export interface AgentSurfaceSuggestion {
  intent: BrandPromptIntent;
  label: string;
  prompt: string;
}

const MAX_LABEL_LENGTH = 32;
const MAX_PROMPT_LENGTH = 220;

function clamp(value: string, maxLength: number): string {
  return value
    .trim()
    .replace(WHITESPACE_RUNS_PATTERN, ' ')
    .slice(0, maxLength)
    .trim();
}

/** A label is cut at a word, never mid-word, and says so with an ellipsis. */
function clampLabel(value: string, maxLength: number): string {
  const text = value.trim().replace(WHITESPACE_RUNS_PATTERN, ' ');
  if (text.length <= maxLength) {
    return text;
  }
  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const atWord = lastSpace > maxLength / 2 ? cut.slice(0, lastSpace) : cut;
  return `${atWord.trimEnd()}…`;
}

const MIN_BARE_TOPIC_LENGTH = 6;

/**
 * Brand topics are free text, and they are pasted into "Create {topic}" /
 * "Plan {topic}". Strip stray punctuation ("French builder identity;") and
 * drop entries that cannot stand alone after a verb: a single short word such
 * as a name ("David") reads as nonsense, so those fall back to the route's
 * own suggestions. Acronyms ("SEO") and multi-word topics are kept.
 */
export function sanitizeBrandTopic(value: string | undefined): string | null {
  const topic = (value ?? '')
    .replace(WHITESPACE_RUNS_PATTERN, ' ')
    .replace(EDGE_PUNCTUATION_PATTERN, '');
  if (!topic) {
    return null;
  }
  const isBareWord = !topic.includes(' ');
  const isAcronym = ACRONYM_PATTERN.test(topic);
  if (isBareWord && !isAcronym && topic.length < MIN_BARE_TOPIC_LENGTH) {
    return null;
  }
  return topic;
}

function unique(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = value?.trim();
    const key = normalized?.toLowerCase();
    if (!normalized || !key || seen.has(key)) {
      return [];
    }
    seen.add(key);
    return [normalized];
  });
}

export function resolveAgentPromptSurface(
  pathname: string,
): AgentPromptSurface | null {
  if (pathname.startsWith('/analytics')) return 'analytics';
  if (pathname.startsWith('/automation')) return 'automation';
  if (pathname.startsWith(APP_ROUTES.PUBLISHING.CALENDAR)) return 'calendar';
  if (pathname.startsWith('/library')) return 'library';
  if (pathname.startsWith('/discovery')) return 'discovery';
  if (pathname.startsWith('/publishing')) return 'review';
  if (
    STUDIO_APP_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ||
    pathname.startsWith('/edit') ||
    pathname.startsWith('/articles')
  ) {
    return 'studio';
  }
  if (pathname.startsWith('/agent') || pathname.startsWith('/overview')) {
    return 'conversation';
  }
  return null;
}

function buildFallbackSeed(topic: string, audience: string): IBrandPromptSeed {
  return {
    angle: 'practical guidance',
    audience,
    preferredFormats: ['post'],
    topic,
  };
}

function buildSuggestion(
  intent: BrandPromptIntent,
  label: string,
  prompt: string,
): AgentSurfaceSuggestion {
  return {
    intent,
    label: clampLabel(label, MAX_LABEL_LENGTH),
    prompt: clamp(prompt, MAX_PROMPT_LENGTH),
  };
}

function buildSurfaceSuggestions(
  surface: AgentPromptSurface,
  seeds: IBrandPromptSeed[],
  tone: string,
): AgentSurfaceSuggestion[] {
  const first = seeds[0];
  if (!first) {
    return [];
  }
  const second = seeds[1] ?? first;
  const third = seeds[2] ?? first;
  const format = first.preferredFormats[0] ?? 'post';

  switch (surface) {
    case 'analytics':
      return [
        buildSuggestion(
          'analyze',
          `Analyze ${first.topic}`,
          `Analyze performance for content about ${first.topic} and identify the strongest pattern to repeat for ${first.audience}.`,
        ),
        buildSuggestion(
          'plan',
          `Grow ${second.topic}`,
          `Recommend the next three moves to improve content about ${second.topic}, while staying aligned with our ${tone} voice.`,
        ),
        buildSuggestion(
          'create',
          `Remix ${third.topic}`,
          `Turn the best-performing angle for ${third.topic} into three fresh content ideas for ${third.audience}.`,
        ),
      ];
    case 'automation':
      return [
        buildSuggestion(
          'plan',
          `Automate ${first.topic}`,
          `Plan a safe recurring workflow for ${first.topic} content aimed at ${first.audience}. Keep publishing paused until I approve it.`,
        ),
        buildSuggestion(
          'create',
          `Build ${second.topic} flow`,
          `Draft an automation that creates ${second.preferredFormats[0] ?? 'post'} content about ${second.topic} in our ${tone} voice.`,
        ),
        buildSuggestion(
          'analyze',
          'Check brand fit',
          `Review my active automations and flag anything that does not support ${third.topic} or our ${tone} brand voice.`,
        ),
      ];
    case 'calendar':
      return [
        buildSuggestion(
          'plan',
          `Plan ${first.topic}`,
          `Plan next week's content around ${first.topic} for ${first.audience}, balanced across our preferred formats.`,
        ),
        buildSuggestion(
          'create',
          `Fill ${second.topic} gaps`,
          `Find gaps in my calendar and suggest brand-aligned posts about ${second.topic} to fill them.`,
        ),
        buildSuggestion(
          'analyze',
          'Balance topics',
          `Analyze my schedule and rebalance it across ${first.topic}, ${second.topic}, and ${third.topic}.`,
        ),
      ];
    case 'library':
      return [
        buildSuggestion(
          'analyze',
          `Find ${first.topic} assets`,
          `Find the strongest reusable assets in my library for content about ${first.topic}.`,
        ),
        buildSuggestion(
          'create',
          `Create ${second.topic}`,
          `Create three ${tone} visual directions about ${second.topic} for ${second.audience}.`,
        ),
        buildSuggestion(
          'plan',
          'Organize by topics',
          `Suggest how to organize my library around ${first.topic}, ${second.topic}, and ${third.topic}.`,
        ),
      ];
    case 'discovery':
      return [
        buildSuggestion(
          'analyze',
          `Research ${first.topic}`,
          `Research current patterns around ${first.topic} that are relevant to ${first.audience}, without drifting from our brand voice.`,
        ),
        buildSuggestion(
          'create',
          `Ideas for ${second.topic}`,
          `Turn current signals around ${second.topic} into five original content ideas in our ${tone} voice.`,
        ),
        buildSuggestion(
          'plan',
          `Track ${third.topic}`,
          `Plan a focused research watchlist for ${third.topic} and explain what would make a signal worth acting on.`,
        ),
      ];
    case 'review':
      return [
        buildSuggestion(
          'analyze',
          'Review brand fit',
          `Review pending content for alignment with our ${tone} voice, audience, and core topics.`,
        ),
        buildSuggestion(
          'create',
          `Improve ${first.topic}`,
          `Improve pending content about ${first.topic} for ${first.audience} while preserving the original intent.`,
        ),
        buildSuggestion(
          'plan',
          'Prioritize queue',
          `Prioritize my review queue by brand fit and relevance to ${first.topic}, ${second.topic}, and ${third.topic}.`,
        ),
      ];
    case 'studio':
      return [
        buildSuggestion(
          'create',
          `Create ${first.topic}`,
          `Create a ${tone} ${format} about ${first.topic} for ${first.audience}, using a ${first.angle.toLowerCase()} angle.`,
        ),
        buildSuggestion(
          'create',
          `Variant for ${second.topic}`,
          `Create three distinct asset directions about ${second.topic} for ${second.audience}, all consistent with our brand voice.`,
        ),
        buildSuggestion(
          'analyze',
          'Check brand voice',
          `Review the current asset for brand fit and suggest the highest-impact change for ${third.topic}.`,
        ),
      ];
    case 'conversation':
      return [
        buildSuggestion(
          'create',
          `Create ${first.topic}`,
          `Create three ${tone} ${format} ideas about ${first.topic} for ${first.audience}, using a ${first.angle.toLowerCase()} angle.`,
        ),
        buildSuggestion(
          'plan',
          `Plan ${second.topic}`,
          `Plan a week of content about ${second.topic} for ${second.audience}, using our ${tone} voice and a ${second.angle.toLowerCase()} angle.`,
        ),
        buildSuggestion(
          'analyze',
          `Analyze ${third.topic}`,
          `Analyze our recent content about ${third.topic} and recommend what to repeat for ${third.audience}, aligned with our ${tone} voice.`,
        ),
      ];
  }
}

export function resolveBrandSurfaceSuggestions(
  pathname: string,
  agentConfig?: IBrandAgentConfig,
): AgentSurfaceSuggestion[] {
  const surface = resolveAgentPromptSurface(pathname);
  if (!surface || !agentConfig) {
    return [];
  }

  const topics = unique(
    [
      ...(agentConfig.strategy?.topics ?? []),
      ...(agentConfig.voice?.messagingPillars ?? []),
      ...(agentConfig.prompting?.seeds.map((seed) => seed.topic) ?? []),
    ].map(sanitizeBrandTopic),
  ).slice(0, 6);
  if (topics.length === 0) {
    return [];
  }

  const audience =
    normalizeBrandAudience(agentConfig.voice?.audience)[0] ??
    agentConfig.prompting?.seeds.find((seed) => seed.audience.trim())
      ?.audience ??
    'the brand audience';
  const tone = agentConfig.voice?.tone?.trim() || 'brand-aligned';
  const profileSeeds = agentConfig.prompting?.seeds ?? [];
  const seeds = topics.map((topic) => {
    const matchingSeed = profileSeeds.find(
      (seed) =>
        sanitizeBrandTopic(seed.topic)?.toLowerCase() === topic.toLowerCase(),
    );
    return matchingSeed ?? buildFallbackSeed(topic, audience);
  });

  while (seeds.length < 3) {
    const topic = topics[seeds.length % topics.length];
    if (!topic) {
      return [];
    }
    seeds.push(buildFallbackSeed(topic, audience));
  }

  return buildSurfaceSuggestions(surface, seeds, tone).slice(0, 3);
}
