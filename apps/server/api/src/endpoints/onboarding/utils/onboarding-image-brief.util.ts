import type {
  OnboardingImageBrief,
  OnboardingImageBriefInput,
} from '@api/endpoints/onboarding/onboarding.interfaces';
import type { FirstRunImageSlots } from '@api/helpers/utils/first-run-image-generation/first-run-image-generation.interfaces';
import { isPlaceholderBrandText } from '@api/services/signup-prefill/utils/brand-system-prompt.util';

const WHITESPACE_RUNS_PATTERN = /\s+/g;
const TRAILING_PUNCTUATION_PATTERN = /[\s.,;:!?-]+$/u;
const HTTP_URLS_PATTERN = /https?:\/\/\S+/g;
const MENTIONS_AND_HASHTAGS_PATTERN = /[@#][\p{L}\p{N}_]+/gu;
const EMOJI_SEQUENCES_PATTERN = /\p{Extended_Pictographic}|\u200d|\ufe0f/gu;
const SENTENCE_BOUNDARY_PATTERN = /(?<=[.!?])\s+/u;
const HEX_COLOR_PATTERN = /^#?([\da-f]{3}|[\da-f]{6})$/i;

type VisualKind =
  | 'creator'
  | 'generic'
  | 'product'
  | 'service'
  | 'tech'
  | 'wellness';

/** The slots that depend on what the brand does; the rest are shared. */
type VisualProfile = Required<
  Pick<
    FirstRunImageSlots,
    'camera' | 'lens' | 'lighting' | 'mood' | 'scene' | 'style' | 'subject'
  >
> &
  Pick<FirstRunImageSlots, 'action'>;

const VISUAL_PROFILES: Record<VisualKind, VisualProfile> = {
  creator: {
    action: 'in the middle of recording, absorbed in the work',
    camera: 'eye-level, slightly off-center with the subject on a third',
    lens: '35mm',
    lighting: 'warm practical lamps with a soft key light',
    mood: 'focused, creative',
    scene: "a lived-in creator's studio with a microphone and a camera rig",
    style: 'candid documentary photography',
    subject: "a creator's workspace mid-production, with no readable screens",
  },
  generic: {
    camera: 'eye-level, subject centered with generous negative space',
    lens: '50mm',
    lighting: 'soft directional daylight',
    mood: 'calm, confident',
    scene: 'a simple, uncluttered backdrop in one restrained color',
    style: 'minimal editorial still life',
    subject: 'one clear symbolic object that stands for the idea above',
  },
  product: {
    action: 'resting still, turned slightly toward the camera',
    camera: 'eye-level three-quarter angle, subject on the lower third',
    lens: '50mm with shallow depth of field',
    lighting: 'soft window daylight with gentle shadow falloff',
    mood: 'warm, trustworthy',
    scene: 'a real shop shelf or tabletop with a softly blurred background',
    style: 'editorial product photography, natural colors',
    subject: 'a hero arrangement of the physical products described above',
  },
  service: {
    action: 'gesturing mid-explanation, hands visible',
    camera: 'eye-level medium shot, subject off-center',
    lens: '85mm portrait lens',
    lighting: 'soft key light from a window with a subtle rim light',
    mood: 'confident, approachable',
    scene: 'a bright, tidy workspace with a blurred background',
    style: 'natural environmental portrait photography',
    subject: 'a professional as the human face of the service',
  },
  tech: {
    action: 'streaming left to right as it resolves',
    camera: 'slightly low angle, single focal point at the center',
    lens: '35mm, deep focus',
    lighting: 'cool rim light with one warm accent glow',
    mood: 'calm, precise, futuristic',
    scene: 'a dark minimal space with depth and no readable screens',
    style: 'polished 3D render, minimal, high contrast',
    subject:
      'a visual metaphor for the work being automated: scattered tasks flowing through connected nodes into one finished result',
  },
  wellness: {
    action: 'caught mid-movement, fully committed',
    camera: 'low angle, subject filling two thirds of the frame',
    lens: '70mm',
    lighting: 'low sun with long soft shadows',
    mood: 'energetic, grounded',
    scene:
      'an outdoor or studio training space with open air around the subject',
    style: 'natural sports photography',
    subject: 'a person in a focused moment of effort',
  },
};

/** Weighted cues per kind, tried against the lowercased brand context. */
const KIND_CUES: ReadonlyArray<
  readonly [Exclude<VisualKind, 'generic'>, RegExp]
> = [
  [
    'product',
    /\b(?:(?:pet|tea|treat|food|shop|store|menu|cafe|product)s?\b|supply|supplies|boutique|retail|merch|kibble|coffee|bak(?:e|ery)|restaurant|skincare|candle|jewel|apparel|cloth|ecommerce|e-commerce|handmade|organic|grocery|furniture|decor|fashion|beauty)/g,
  ],
  [
    'wellness',
    /\b(fitness|strength|conditioning|crossfit|pilates|gym|yoga|wellness|health|nutrition|workout|therap|meditat|sport|running|athlet|trainer)/g,
  ],
  [
    'tech',
    /\b(?:ai|agents?|apps?|api|saas|llm|bots?|data|code|cloud|software|platform|developer|startup|workflow)\b|\b(?:automat|cyber|no-code|machine learning)/g,
  ],
  [
    'service',
    /\b(coach|consult|agency|advis|mentor|course|educat|teach|lawyer|attorney|accountan|financ|invest|real estate|realtor|marketing|freelanc|b2b|founder|clients?)/g,
  ],
  [
    'creator',
    /\b(creator|influencer|podcast|youtube|streamer|newsletter|blog|personal brand|writer|artist|music|photograph|vlog)/g,
  ],
];

const SELL_GOAL = /sell|product|sale|convert|lead|revenue/i;
const AUDIENCE_GOAL = /audience|grow|follow|reach|awareness|engage/i;

/** What every first-run image must keep out, sent as the negative prompt. */
const FIRST_RUN_AVOID = [
  'logos',
  'text overlays',
  'captions',
  'signage and packaging text',
  'watermarks',
  'invented claims',
  'stock-photo cliches',
  'distorted hands or faces',
];

const MAX_IDEA_CHARS = 200;
const MAX_FOCUS_CHARS = 120;

function collapse(text: string): string {
  return text.replace(WHITESPACE_RUNS_PATTERN, ' ').trim();
}

function trimTrailingPunctuation(text: string): string {
  return text.replace(TRAILING_PUNCTUATION_PATTERN, '');
}

function clipAtWord(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const clipped = text.slice(0, limit);
  const lastSpace = clipped.lastIndexOf(' ');
  return trimTrailingPunctuation(
    lastSpace > limit / 2 ? clipped.slice(0, lastSpace) : clipped,
  );
}

/**
 * The idea of a post, as a plain sentence: links, mentions, hashtags and emoji
 * removed, first sentence only. Image models should see the idea, not the
 * social-media dressing around it.
 */
export function readPostIdea(post: string): string {
  const stripped = collapse(
    post
      .replace(HTTP_URLS_PATTERN, ' ')
      .replace(MENTIONS_AND_HASHTAGS_PATTERN, ' ')
      .replace(EMOJI_SEQUENCES_PATTERN, ' '),
  );
  const [firstSentence = ''] = stripped.split(SENTENCE_BOUNDARY_PATTERN);
  return clipAtWord(trimTrailingPunctuation(firstSentence), MAX_IDEA_CHARS);
}

function readFocus(input: OnboardingImageBriefInput): string | undefined {
  const brandName = collapse(input.brandName).toLowerCase();
  const offer = collapse(input.offer ?? '');
  const isOfferDistinct =
    offer !== '' &&
    offer.toLowerCase() !== brandName &&
    !brandName.includes(offer.toLowerCase());
  if (isOfferDistinct) return clipAtWord(offer, MAX_FOCUS_CHARS);

  if (!isPlaceholderBrandText(input.description)) {
    const [firstSentence = ''] = collapse(input.description ?? '').split(
      SENTENCE_BOUNDARY_PATTERN,
    );
    return clipAtWord(trimTrailingPunctuation(firstSentence), MAX_FOCUS_CHARS);
  }
  return undefined;
}

function pickKind(text: string): VisualKind {
  let best: VisualKind = 'generic';
  let bestScore = 0;
  for (const [kind, cue] of KIND_CUES) {
    const score = [...text.matchAll(cue)].length;
    if (score > bestScore) {
      best = kind;
      bestScore = score;
    }
  }
  return best;
}

/** Hue ranges in degrees, upper bound exclusive; red wraps around at the end. */
const HUE_NAMES: ReadonlyArray<readonly [number, string]> = [
  [15, 'red'],
  [40, 'orange'],
  [65, 'yellow'],
  [160, 'green'],
  [200, 'teal'],
  [250, 'blue'],
  [290, 'purple'],
  [335, 'pink'],
  [361, 'red'],
];

/**
 * A hex colour in plain words ("deep blue", "pale yellow", "black"). The image
 * request gets words, not codes, because a model can draw "#1F6FEB" as text.
 */
export function describeColor(hex: string): string | undefined {
  const match = HEX_COLOR_PATTERN.exec(hex.trim());
  const digits = match?.[1];
  if (!digits) return undefined;
  const full =
    digits.length === 3
      ? [...digits].map((digit) => digit + digit).join('')
      : digits;
  const [red = 0, green = 0, blue = 0] = [0, 2, 4].map(
    (offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255,
  );
  const high = Math.max(red, green, blue);
  const low = Math.min(red, green, blue);
  const lightness = (high + low) / 2;
  const spread = high - low;
  const saturation =
    spread === 0 ? 0 : spread / (1 - Math.abs(2 * lightness - 1));

  if (lightness < 0.15) return 'black';
  if (lightness > 0.92) return 'white';
  if (saturation < 0.12) return lightness < 0.4 ? 'charcoal' : 'grey';

  const hue =
    60 *
    (high === red
      ? ((green - blue) / spread + 6) % 6
      : high === green
        ? (blue - red) / spread + 2
        : (red - green) / spread + 4);
  const name = HUE_NAMES.find(([limit]) => hue < limit)?.[1] ?? 'red';
  if (lightness < 0.28) return `deep ${name}`;
  if (lightness > 0.72) return `pale ${name}`;
  return name;
}

/** "deep blue and black color palette", or nothing when no colour reads. */
function describePalette(palette: readonly string[] | undefined) {
  const names = [
    ...new Set((palette ?? []).map(describeColor).filter(Boolean)),
  ].slice(0, 3);
  return names.length ? `${names.join(' and ')} color palette` : undefined;
}

function joinParts(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(', ');
}

/**
 * The first-run image request: a lead sentence with the post's idea and the
 * structured slots (subject, scene, camera, lens, lighting, style, mood, avoid)
 * chosen from what the brand does. Built from what the person typed and the
 * post itself, so it still works for a personal signup with no website and no
 * scraped copy. The brand's saved colours join the style as plain colour
 * words. Nothing here repeats a form answer or a brand name: image models
 * would draw them as text.
 */
export function buildOnboardingImageBrief(
  input: OnboardingImageBriefInput,
): OnboardingImageBrief {
  const idea = readPostIdea(input.post);
  const focus = readFocus(input);
  const goals = (input.goals ?? []).join(' ');
  const context = [input.brandName, focus, input.audience, idea]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const profile = VISUAL_PROFILES[pickKind(context)];

  const tone = input.tone?.toLowerCase() ?? '';
  const toneStyle = tone.includes('professional')
    ? 'restrained palette, precise composition'
    : tone.includes('casual')
      ? 'candid, relaxed framing'
      : undefined;

  return {
    prompt: idea || focus || profile.subject,
    slots: {
      ...(profile.action ? { action: profile.action } : {}),
      blacklist: FIRST_RUN_AVOID,
      camera: profile.camera,
      lens: profile.lens,
      lighting: profile.lighting,
      mood: profile.mood,
      scene: profile.scene,
      style: joinParts(
        profile.style,
        SELL_GOAL.test(goals) ? 'clean commercial finish' : undefined,
        AUDIENCE_GOAL.test(goals) ? 'scroll-stopping contrast' : undefined,
        toneStyle,
        describePalette(input.palette),
      ),
      subject: profile.subject,
    },
  };
}
