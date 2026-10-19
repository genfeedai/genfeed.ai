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

function selectVisualCues(brief: ContentHarnessBrief): string[] {
  const cues = [
    ...brief.styleDirectives,
    ...brief.systemDirectives,
    ...brief.guardrails,
  ]
    .filter(isVisualCue)
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

/**
 * Fold a harness brief into a media/generation prompt.
 *
 * Always keeps the operator prompt first; harness is advisory context so the
 * model still follows the user's creative intent while locking brand fidelity.
 * Visual kinds get a short brand look and the subject lock, not the whole
 * brief.
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
  const prompt = userPrompt.trim();
  if (!brief) {
    return prompt;
  }

  const suffix = VISUAL_KINDS.has(brief.metadata.contentType)
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
