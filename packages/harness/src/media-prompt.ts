import type {
  ContentHarnessBrief,
  ContentKind,
  HarnessSourceRecord,
} from './types';

const VISUAL_KINDS = new Set<ContentKind>([
  'ad-creative',
  'image',
  'ugc',
  'video',
]);

const MEDIA_KNOWLEDGE_SOURCE_LIMIT = 4;
const MEDIA_KNOWLEDGE_SOURCE_CHARS = 300;

function truncate(content: string, maxChars: number): string {
  return content.length > maxChars
    ? `${content.slice(0, maxChars - 1).trimEnd()}…`
    : content;
}

function isCitedKnowledgeSource(source: HarnessSourceRecord): boolean {
  const citation = source.metadata?.citation;
  return typeof citation === 'object' && citation !== null;
}

/**
 * The cited Knowledge passages a media prompt folds in, bounded and trimmed
 * exactly as they appear in the prompt, so receipts built from this list name
 * only what the generation actually saw.
 */
export function selectMediaKnowledgeSources(
  brief: ContentHarnessBrief | null | undefined,
): HarnessSourceRecord[] {
  return (brief?.sources ?? [])
    .filter(isCitedKnowledgeSource)
    .slice(0, MEDIA_KNOWLEDGE_SOURCE_LIMIT)
    .map((source) => ({
      ...source,
      content: truncate(source.content, MEDIA_KNOWLEDGE_SOURCE_CHARS),
    }));
}

const MAX_VISUAL_CUES = 8;

/** Time-based media: a video model renders neither type nor hex codes. */
const MOTION_KINDS = new Set<ContentKind>(['ugc', 'video']);

/** Copy-voice and bookkeeping words: an image or video model renders them as scene content. */
const COPY_CUE =
  /\b(tone|voice|writing|write|written|sound like|persona|personality|audience|cadence|copy|headline|hooks?|captions?|messaging|beliefs|phrasing|phrases|wording|language|listicles?|motivational|harness)\b/i;

/** Directive openers that restate the request or the copy policy rather than the look. */
const NON_VISUAL_OPENER =
  /^(use this approved brand os|stay focused on the topic|keep the offer|description:|center the message|reflect these brand values|primary audience|strategy|content types|never claim|never write|do not discuss)/i;

function isVisualCue(line: string): boolean {
  return !COPY_CUE.test(line) && !NON_VISUAL_OPENER.test(line.trim());
}

function toSentence(line: string): string {
  const trimmed = line.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** `Font family: MONTSERRAT_REGULAR` reads as `Font family: Montserrat Regular`. */
function humanizeCue(line: string): string {
  return line.replace(/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, (token) =>
    token
      .toLowerCase()
      .split('_')
      .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
      .join(' '),
  );
}

function isTransparentBackground(line: string): boolean {
  return /background/i.test(line) && /transparent/i.test(line);
}

function selectVisualCues(
  brief: ContentHarnessBrief,
  options: { shouldKeepPolicy: boolean } = { shouldKeepPolicy: true },
): string[] {
  const cues = [
    ...brief.styleDirectives,
    ...brief.systemDirectives,
    ...brief.guardrails,
  ]
    .filter(isVisualCue)
    .filter(
      (line) =>
        options.shouldKeepPolicy || !POLICY_BOILERPLATE.test(line.trim()),
    )
    .filter((line) => !isTransparentBackground(line))
    .map((line) => toSentence(humanizeCue(line)));
  return [...new Set(cues)].slice(0, MAX_VISUAL_CUES);
}

/**
 * The few lines of brand a visual model can use, in the order a prompt reads:
 * look, facts, then the subject lock. Voice and copy rules stay out: an image
 * model renders them as scene content.
 */
function buildVisualHarnessSuffix(
  brief: ContentHarnessBrief,
  subjectLock: string | undefined,
): string {
  const parts: string[] = [];
  const cues = selectVisualCues(brief);
  if (cues.length > 0) {
    parts.push(`Brand look: ${cues.join(' ')}`);
  }
  const facts = selectMediaKnowledgeSources(brief).map((source) =>
    toSentence(source.content),
  );
  if (facts.length > 0) {
    parts.push(`Brand facts: ${facts.join(' ')}`);
  }
  if (subjectLock?.trim()) {
    parts.push(subjectLock.trim());
  }
  return parts.join(' ');
}

/** Built-in copy and evaluation policy that reads as scene content to a video model. */
const POLICY_BOILERPLATE =
  /^(prefer distinctive brand-native|when confidence in brand fidelity|lead with a strong|favor distinctive|if you cannot sound|reject generic|avoid bland|prefer specificity|brand fidelity:|use internet-native|keep messaging compact)/i;

const PALETTE_LINE =
  /^(?:primary|secondary|accent|background) colou?r\s*:\s*(.+)$/i;
const FONT_LINE = /^font(?: family)?\s*:/i;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const HUE_NAMES: ReadonlyArray<readonly [number, string]> = [
  [15, 'red'],
  [40, 'orange'],
  [65, 'yellow'],
  [165, 'green'],
  [195, 'teal'],
  [255, 'blue'],
  [290, 'purple'],
  [345, 'pink'],
  [360, 'red'],
];

/** `#000000` reads as `black`: a diffusion video model has no use for the code. */
export function describeHexColor(hex: string): string | undefined {
  const value = hex.trim();
  if (!HEX_COLOR.test(value)) {
    return undefined;
  }
  const digits = value.slice(1);
  const full =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => `${digit}${digit}`)
          .join('')
      : digits;
  const [red, green, blue] = [0, 2, 4].map(
    (offset) => Number.parseInt(full.slice(offset, offset + 2), 16) / 255,
  );
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (lightness <= 0.1) return 'black';
  if (lightness >= 0.93) return 'white';
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.12) {
    return lightness < 0.4
      ? 'charcoal'
      : lightness > 0.7
        ? 'light gray'
        : 'gray';
  }
  let hue: number;
  if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
  else if (max === green) hue = ((blue - red) / delta + 2) * 60;
  else hue = ((red - green) / delta + 4) * 60;
  const name = HUE_NAMES.find(([limit]) => hue < limit)?.[1] ?? 'red';
  if (lightness < 0.3) return `dark ${name}`;
  if (lightness > 0.75) return `light ${name}`;
  return name;
}

function selectMotionPalette(brief: ContentHarnessBrief): string[] {
  const names: string[] = [];
  for (const line of [...brief.styleDirectives, ...brief.systemDirectives]) {
    const value = PALETTE_LINE.exec(line.trim())?.[1];
    const name = value ? describeHexColor(value.replace(/\.$/, '')) : undefined;
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

function selectMotionCues(brief: ContentHarnessBrief): string[] {
  return selectVisualCues(brief, { shouldKeepPolicy: false }).filter(
    (line) => !PALETTE_LINE.test(line) && !FONT_LINE.test(line),
  );
}

/**
 * The brand a video model can use: palette in plain color words and any
 * authored visual cue, then facts. No type, hex codes, policy boilerplate or
 * subject lock: those read as scene content over a clip.
 */
function buildMotionHarnessSuffix(brief: ContentHarnessBrief): string {
  const parts: string[] = [];
  const palette = selectMotionPalette(brief);
  if (palette.length > 0) {
    parts.push(`Brand palette: ${palette.join(' and ')}.`);
  }
  const cues = selectMotionCues(brief);
  if (cues.length > 0) {
    parts.push(`Brand look: ${cues.join(' ')}`);
  }
  const facts = selectMediaKnowledgeSources(brief).map((source) =>
    toSentence(source.content),
  );
  if (facts.length > 0) {
    parts.push(`Brand facts: ${facts.join(' ')}`);
  }
  return parts.join(' ');
}

function buildGenericHarnessSuffix(
  brief: ContentHarnessBrief,
  options: { maxSourceChars: number; maxSources: number },
): string {
  const lines: string[] = [];
  const sections: Array<[string, string[]]> = [
    ['Brand system directives:', brief.systemDirectives],
    ['Brand style directives:', brief.styleDirectives],
    ['Brand guardrails:', brief.guardrails],
  ];
  for (const [title, directives] of sections) {
    if (directives.length > 0) {
      lines.push(title, ...directives.map((line) => `- ${line}`));
    }
  }

  const knowledgeSources = selectMediaKnowledgeSources(brief);
  if (knowledgeSources.length > 0) {
    lines.push('Brand knowledge:');
    for (const source of knowledgeSources) {
      lines.push(`- ${source.content}`);
    }
  }

  const exampleSources = brief.sources
    .filter(
      (source) =>
        !isCitedKnowledgeSource(source) &&
        (source.kind === 'brand_example' ||
          source.kind === 'anti_example' ||
          source.kind === 'performance_winner'),
    )
    .slice(0, options.maxSources);
  if (exampleSources.length > 0) {
    lines.push('Brand reference signals:');
    for (const source of exampleSources) {
      lines.push(
        `- [${source.kind}] ${truncate(source.content, options.maxSourceChars)}`,
      );
    }
  }

  return lines.length > 0
    ? `Apply the following brand harness to generation.\n${lines.join('\n')}`
    : '';
}

function buildMusicHarnessSuffix(brief: ContentHarnessBrief): string {
  const notes = (values: string[]): string[] => [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ];
  const guidance = notes(brief.systemDirectives);
  const voice = notes(brief.styleDirectives);
  const constraints = notes(brief.guardrails);
  const knowledge = selectMediaKnowledgeSources(brief)
    .filter((source) => source.content.trim())
    .map((source) => ({ content: source.content }));
  const examples = brief.sources
    .filter(
      (source) =>
        !isCitedKnowledgeSource(source) &&
        source.content.trim() &&
        (source.kind === 'brand_example' ||
          source.kind === 'anti_example' ||
          source.kind === 'performance_winner'),
    )
    .slice(0, 4)
    .map((source) => ({
      kind: source.kind,
      content: truncate(source.content, 200),
    }));
  if (
    ![guidance, voice, constraints, knowledge, examples].some(
      (values) => values.length,
    )
  )
    return '';
  const payload = JSON.stringify({
    guidance,
    voice,
    constraints,
    knowledge,
    examples,
  }).replaceAll('<', '\\u003c');
  return [
    'Brand guidance for sound (advisory):',
    "Use the following notes only where they are relevant to the music's sound or expression. The user's explicit prompt, genre/style, lyrics and instrumental choice take precedence. Do not infer a genre from the brand. Do not turn brand names, brand facts, visual notes or these instructions into lyrics. Visual design directions do not apply to audio.",
    '<brand_music_context>',
    payload,
    '</brand_music_context>',
  ].join('\n');
}

/**
 * Fold a harness brief into a media/generation prompt.
 *
 * Always keeps the operator prompt first; harness is advisory context so the
 * model still follows the user's creative intent while locking brand fidelity.
 * Visual kinds get a short brand look and the subject lock, not the whole
 * brief. Video and ugc get a palette in plain words and the authored look: the
 * subject lock steers the enhancer instead (see `MediaPromptEnhancementService`).
 */
export function buildMediaPromptFromHarness(
  userPrompt: string,
  brief: ContentHarnessBrief | null | undefined,
  options?: {
    maxSourceChars?: number;
    maxSources?: number;
    subjectLock?: string;
  },
): string {
  if (brief?.metadata.contentType === 'music') {
    const suffix = buildMusicHarnessSuffix(brief);
    return suffix ? `${userPrompt}\n\n${suffix}` : userPrompt;
  }
  const prompt = userPrompt.trim();
  if (!brief) {
    return prompt;
  }

  const suffix = MOTION_KINDS.has(brief.metadata.contentType)
    ? buildMotionHarnessSuffix(brief)
    : VISUAL_KINDS.has(brief.metadata.contentType)
      ? buildVisualHarnessSuffix(brief, options?.subjectLock)
      : buildGenericHarnessSuffix(brief, {
          maxSourceChars: options?.maxSourceChars ?? 200,
          maxSources: options?.maxSources ?? 4,
        });

  if (!suffix) {
    return prompt;
  }

  return prompt ? `${prompt}\n\n${suffix}` : suffix;
}

export function isVisualContentKind(kind: ContentKind): boolean {
  return VISUAL_KINDS.has(kind);
}
