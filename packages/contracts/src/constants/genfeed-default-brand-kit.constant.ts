/**
 * Genfeed default style kit, version 1.
 *
 * Every brand starts with a DRAFT revision built from this definition so
 * branded generation always has an identity to resolve. It supplies style only
 * (palette, type, voice, craft rules): never facts, claims, offerings, logos or
 * assets. Output generated from it is provisional until the owner approves
 * their own kit, which fully replaces it.
 *
 * Bump the version for any content change; existing copies never mutate.
 */
export const GENFEED_DEFAULT_KIT_ID = 'genfeed_default' as const;
export const GENFEED_DEFAULT_KIT_VERSION = 1 as const;
export const GENFEED_DEFAULT_KIT_SOURCE_ID =
  `${GENFEED_DEFAULT_KIT_ID}@${GENFEED_DEFAULT_KIT_VERSION}` as const;
export const GENFEED_DEFAULT_KIT_LABEL = 'Genfeed default style kit' as const;
export const GENFEED_DEFAULT_KIT_EVIDENCE_ID = 'genfeed_default_kit' as const;

export const GENFEED_DEFAULT_KIT_PALETTE = {
  accent: '#FF6B57',
  background: '#0A0A0A',
  text: '#F5EFE6',
} as const;

export const GENFEED_DEFAULT_KIT_TYPOGRAPHY = {
  body: { family: 'Satoshi', weight: 400 },
  display: { family: 'Zodiak', weight: 700 },
} as const;

export const GENFEED_DEFAULT_KIT_VOICE = {
  audience: ['People scrolling a feed who decide in the first line'],
  doNotSoundLike: [
    'A corporate press release',
    'Hype and buzzword filler',
    'A generic AI assistant',
  ],
  promptGuidelines: [
    'Open with the hook in under eight words.',
    'Use short lines and strong verbs.',
    'Make one concrete point per post.',
    'Never invent metrics, prices, testimonials, discounts or URLs.',
    'Avoid hype and AI-cliche words.',
    'Use no hashtags or emoji.',
    'Never mention Genfeed or use its logo, offerings or claims.',
  ].join('\n'),
  sampleOutput: 'Stop scrolling. Say the one thing that matters. Then show it.',
  style:
    'Very short lines, strong verbs, hook first, one concrete point, high energy without exclamation spam.',
  tone: 'Bold and punchy',
  values: ['Clarity', 'Momentum', 'Honesty'],
} as const;

export const GENFEED_DEFAULT_KIT_MANDATORY_RULES = [
  {
    id: 'rule_no_invented_facts',
    text: 'Never invent metrics, prices, testimonials, discounts or URLs.',
  },
] as const;

export const GENFEED_DEFAULT_KIT_AVOID_RULES = [
  {
    id: 'rule_no_hype_words',
    text: 'Avoid hype and AI-cliche words such as revolutionize, game-changer, unlock, delve, and "in today\'s fast-paced world".',
  },
  {
    id: 'rule_no_hashtags_emoji',
    text: "Use no hashtags or emoji unless the owner's own kit asks for them.",
  },
  {
    id: 'rule_no_genfeed_claims',
    text: 'Do not mention Genfeed or use its logo, offerings or claims.',
  },
] as const;
