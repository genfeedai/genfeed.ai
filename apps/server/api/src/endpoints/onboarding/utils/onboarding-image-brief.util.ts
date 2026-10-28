import type {
  OnboardingImageBrief,
  OnboardingImageBriefInput,
} from '@api/endpoints/onboarding/onboarding.interfaces';
import type { FirstRunImageSlots } from '@api/helpers/utils/first-run-image-generation/first-run-image-generation.interfaces';
import { isPlaceholderBrandText } from '@api/services/signup-prefill/utils/brand-system-prompt.util';

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
  'watermarks',
  'invented claims',
  'stock-photo cliches',
  'distorted hands or faces',
];

const MAX_IDEA_CHARS = 200;
const MAX_FOCUS_CHARS = 120;

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function trimTrailingPunctuation(text: string): string {
  return text.replace(/[\s.,;:!?-]+$/u, '');
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
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[@#][\p{L}\p{N}_]+/gu, ' ')
      .replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, ' '),
  );
  const [firstSentence = ''] = stripped.split(/(?<=[.!?])\s+/u);
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
      /(?<=[.!?])\s+/u,
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

function joinParts(...parts: Array<string | undefined>): string {
  return parts.filter(Boolean).join(', ');
}

/**
 * The first-run image request: a lead sentence with the post's idea and the
 * structured slots (subject, scene, camera, lens, lighting, style, mood, avoid)
 * chosen from what the brand does. Built from what the person typed and the
 * post itself, so it still works for a personal signup with no website and no
 * scraped copy. Nothing here repeats a form answer or a brand name: image models
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
      ),
      subject: profile.subject,
    },
  };
}
