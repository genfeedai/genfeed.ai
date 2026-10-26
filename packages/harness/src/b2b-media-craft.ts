import type {
  ContentHarnessContribution,
  ContentHarnessInput,
  ContentHarnessPack,
  ContentKind,
} from './types';

const MOTION_FORMATS = new Set<ContentKind>(['ugc', 'video']);
const STILL_FORMATS = new Set<ContentKind>(['ad-creative', 'image']);

/**
 * Words that mark a business buyer: who the brand sells to, what it sells, or
 * what the request is about. Read from the intent and the voice profile only,
 * so a pack never needs a new Brand OS field to know its audience.
 */
const B2B_SIGNAL =
  /\b(?:b2b|saas|enterprise|startups?|founders?|ceos?|cmos?|ctos?|executives?|leaders?|managers?|teams?|marketers?|agenc(?:y|ies)|businesses|companies|developers?|engineers?|operators?|workflows?)\b/iu;

function collectAudienceText(input: ContentHarnessInput): string {
  return [
    input.intent.audienceHint,
    input.intent.offer,
    input.intent.topic,
    ...(input.voiceProfile?.audience ?? []),
    ...(input.voiceProfile?.messagingPillars ?? []),
  ]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(' ');
}

function isB2bMediaFormat(input: ContentHarnessInput): boolean {
  const { contentType } = input.intent;
  return (
    (MOTION_FORMATS.has(contentType) || STILL_FORMATS.has(contentType)) &&
    B2B_SIGNAL.test(collectAudienceText(input))
  );
}

function buildB2bMediaCraftContribution(
  input: ContentHarnessInput,
): ContentHarnessContribution {
  if (!isB2bMediaFormat(input)) {
    return {};
  }

  const styleDirectives = MOTION_FORMATS.has(input.intent.contentType)
    ? [
        'One action arc and one camera move. Open on a real product frame and stay with it.',
        'Show a believable workplace result, not an abstract metaphor or a generic stock office.',
      ]
    : [
        'Anchor the frame on a real product view. Keep one clear subject and a calm, uncluttered layout.',
        'Show a believable workplace result, not an abstract metaphor or a generic stock office.',
      ];

  return {
    guardrails: [
      'Do not invent logos, brand marks, screens or interface elements. Use only what the reference shows.',
      'Render no text, numbers, labels or watermarks in the frame. On-screen text is added after generation.',
    ],
    styleDirectives,
  };
}

/**
 * Built-in B2B media craft pack: what credible business-software imagery and
 * video look like, and what a generative model should be told not to render.
 * Registered for the `media` surface only, so it never reaches copy prompts.
 * It reads the audience from the intent and voice profile; private brand taste
 * stays in private packs.
 */
export const B2B_MEDIA_CRAFT_HARNESS_PACK: ContentHarnessPack = {
  capabilities: ['b2b-media-craft', 'media-render-guardrails'],
  contribute: buildB2bMediaCraftContribution,
  description:
    'B2B media craft pack: one action arc, a real product anchor, and no model-rendered logos, interface or text.',
  id: 'b2b-media-craft',
  surfaces: ['media'],
  version: '1.0.0',
};
