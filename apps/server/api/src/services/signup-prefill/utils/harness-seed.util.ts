import type { BrandAgentConfig } from '@api/collections/brands/schemas/brand.schema';
import { UpsertHarnessProfileDto } from '@api/collections/harness-profiles/dto/upsert-harness-profile.dto';
import type { IScrapedBrandData } from '@genfeedai/contracts/interfaces';

import { readStringList } from './string-list.util';

export interface BuildSignupHarnessProfileInput {
  agentConfig: BrandAgentConfig;
  brandId: string;
  brandLabel: string;
  scrapedData?: IScrapedBrandData;
}

/**
 * Guardrails every seeded profile carries. These are the failure modes that
 * make first-prompt output read as generic AI filler, so they are stated
 * up-front rather than waiting for the user to discover and write them.
 */
const BASELINE_GUARDRAILS = [
  'Never invent statistics, customer names, or results that were not provided.',
  'No generic AI filler openers ("In today\'s fast-paced world", "Let\'s dive in").',
  'Do not promise outcomes the brand has not publicly claimed.',
];

const BASELINE_STRUCTURE = {
  hook: [
    'Open with a concrete detail, number, or tension — never a definition.',
  ],
  post: [
    'Hook',
    'Context',
    'Insight',
    'Proof or example',
    'Single call to action',
  ],
};

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * Build the default harness profile for a freshly prefilled brand.
 *
 * Everything here is derived from what the scrape and voice analysis already
 * produced — the profile is a *restatement* of the brand voice in the shape the
 * harness consumes (thesis / voice / structure / guardrails / examples), so the
 * very first generation runs with directives instead of an empty contribution.
 */
export function buildSignupHarnessProfile(
  input: BuildSignupHarnessProfileInput,
): UpsertHarnessProfileDto {
  const { agentConfig, brandId, brandLabel, scrapedData } = input;
  const voice = agentConfig.voice ?? {};
  const strategy = agentConfig.strategy ?? {};

  const positioning = [
    readString(scrapedData?.tagline),
    readString(scrapedData?.description),
    ...readStringList(scrapedData?.valuePropositions),
  ].filter((entry): entry is string => Boolean(entry));

  const dto = new UpsertHarnessProfileDto();

  dto.brandId = brandId;
  dto.label = `${brandLabel} — starter harness`;
  dto.description =
    'Generated at signup from the brand website. Edit it as the brand voice sharpens.';
  dto.scope = 'brand';
  dto.status = 'active';
  dto.isDefault = true;
  dto.platforms = readStringList(strategy.platforms);
  dto.audience = readStringList(voice.audience);
  dto.guardrails = [
    ...BASELINE_GUARDRAILS,
    ...readStringList(voice.doNotSoundLike).map(
      (entry) => `Do not sound like: ${entry}.`,
    ),
    ...readStringList(voice.bannedPhrases).map(
      (entry) => `Never use the phrase "${entry}".`,
    ),
  ];
  dto.structure = BASELINE_STRUCTURE;
  dto.metadata = {
    seededAt: new Date().toISOString(),
    source: 'signup-prefill',
  };

  const thesis: Record<string, string[]> = {};
  const pillars = readStringList(voice.messagingPillars);
  const goals = readStringList(strategy.goals);
  const topics = readStringList(strategy.topics);

  if (positioning.length > 0) {
    thesis.positioning = positioning;
  }
  if (pillars.length > 0) {
    thesis.messagingPillars = pillars;
  }
  if (goals.length > 0) {
    thesis.goals = goals;
  }
  if (topics.length > 0) {
    thesis.topics = topics;
  }
  if (Object.keys(thesis).length > 0) {
    dto.thesis = thesis;
  }

  const profileVoice: Record<string, string | string[] | undefined> = {};
  const tone = readString(voice.tone);
  const style = readString(voice.style);
  const values = readStringList(voice.values);

  if (tone) {
    profileVoice.tone = tone;
  }
  if (style) {
    profileVoice.style = style;
  }
  if (values.length > 0) {
    profileVoice.values = values;
  }
  if (Object.keys(profileVoice).length > 0) {
    dto.voice = profileVoice;
  }

  const goodExamples = [
    readString(voice.sampleOutput),
    ...readStringList(voice.taglines),
  ].filter((entry): entry is string => Boolean(entry));

  if (goodExamples.length > 0) {
    dto.examples = { good: goodExamples };
  }

  return dto;
}
