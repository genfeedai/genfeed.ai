/**
 * Structured prompt: the slots a media prompt is made of, stored as fields and
 * rendered into text only when a request is sent.
 *
 * Image and video models read prompts through text encoders trained on natural
 * captions, so XML tags or JSON are not a format they understand: at best they
 * are ignored, at worst they leak into the output as text. The value of
 * "structured prompting" is that every slot (subject, camera, lighting, motion,
 * audio) gets filled in, not the syntax. So the fields are the stored record,
 * easy to edit, compare and learn from, and `renderStructuredPrompt` turns them
 * into plain prose for media models. LLM steps (brand enhancement and similar)
 * read tags well, so they can ask for the `tagged` target instead.
 */

export const STRUCTURED_PROMPT_TEXT_SLOTS = [
  'subject',
  'action',
  'scene',
  'camera',
  'cameraMovement',
  'lens',
  'lighting',
  'style',
  'mood',
  'speech',
] as const;

export const STRUCTURED_PROMPT_LIST_SLOTS = ['sounds', 'avoid'] as const;

export type StructuredPromptTextSlot =
  (typeof STRUCTURED_PROMPT_TEXT_SLOTS)[number];
export type StructuredPromptListSlot =
  (typeof STRUCTURED_PROMPT_LIST_SLOTS)[number];
export type StructuredPromptSlot =
  | StructuredPromptTextSlot
  | StructuredPromptListSlot;

export interface StructuredPrompt {
  /** Who or what the shot is about. */
  subject?: string;
  /** What the subject does; the motion of the shot. */
  action?: string;
  /** Where it happens. */
  scene?: string;
  camera?: string;
  cameraMovement?: string;
  lens?: string;
  lighting?: string;
  style?: string;
  mood?: string;
  /** Spoken line; only rendered for models that generate audio. */
  speech?: string;
  /** Ambient sound and music cues; only rendered for models that generate audio. */
  sounds?: string[];
  /** What must not appear. Sent as a negative prompt, never folded into the prose. */
  avoid?: string[];
}

/** `prose` for image and video models, `tagged` for LLM steps. */
export type PromptRenderTarget = 'prose' | 'tagged';

export interface PromptRenderOptions {
  /**
   * The free-text prompt the person wrote. It stays first, and a slot whose
   * value it already mentions is not repeated.
   */
  lead?: string;
  target?: PromptRenderTarget;
  /** Whether the model generates audio. Sounds and speech are dropped when false. */
  hasAudio?: boolean;
  /** Slots the caller already renders elsewhere, e.g. through an organization template. */
  skip?: readonly StructuredPromptSlot[];
}

export interface RenderedPrompt {
  prompt: string;
  /** The avoid list as one negative-prompt string, when there is one. */
  negativePrompt?: string;
  target: PromptRenderTarget;
  /** The slots that contributed text to `prompt`. */
  usedSlots: StructuredPromptSlot[];
}

const MAX_SLOT_CHARS = 400;
const MAX_LIST_ITEMS = 12;

function cleanText(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, MAX_SLOT_CHARS) : undefined;
}

function cleanList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = [
    ...new Set(
      value.map(cleanText).filter((item): item is string => item !== undefined),
    ),
  ].slice(0, MAX_LIST_ITEMS);
  return items.length > 0 ? items : undefined;
}

/**
 * Trim, collapse whitespace, drop empty slots and cap lengths. Accepts anything
 * (request bodies, database rows) and keeps only the known slots.
 */
export function normalizeStructuredPrompt(
  input: Partial<Record<StructuredPromptSlot, unknown>> | null | undefined,
): StructuredPrompt {
  const result: StructuredPrompt = {};
  if (!input) {
    return result;
  }
  for (const slot of STRUCTURED_PROMPT_TEXT_SLOTS) {
    const value = cleanText(input[slot]);
    if (value) {
      result[slot] = value;
    }
  }
  for (const slot of STRUCTURED_PROMPT_LIST_SLOTS) {
    const value = cleanList(input[slot]);
    if (value) {
      result[slot] = value;
    }
  }
  return result;
}

export function hasStructuredPrompt(
  fields: StructuredPrompt | null | undefined,
): boolean {
  return Object.keys(normalizeStructuredPrompt(fields)).length > 0;
}

function mentions(lead: string, value: string): boolean {
  return lead.toLowerCase().includes(value.toLowerCase());
}

function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function closeSentence(text: string): string {
  const trimmed = text.trim();
  return /[.!?"]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function sentence(text: string): string {
  return closeSentence(capitalize(text.trim()));
}

function escapeTagged(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function toNegativePrompt(avoid: string[] | undefined): string | undefined {
  return avoid && avoid.length > 0 ? avoid.join(', ') : undefined;
}

interface Clause {
  slots: StructuredPromptSlot[];
  text: string;
}

function renderProse(
  fields: StructuredPrompt,
  lead: string,
  hasAudio: boolean,
): Clause[] {
  const clauses: Clause[] = [];
  const fresh = (value: string | undefined): string | undefined =>
    value && !mentions(lead, value) ? value : undefined;

  const subject = fresh(fields.subject);
  const action = fresh(fields.action);
  if (subject || action) {
    clauses.push({
      slots: [
        ...(subject ? (['subject'] as const) : []),
        ...(action ? (['action'] as const) : []),
      ],
      text: sentence([subject, action].filter(Boolean).join(' ')),
    });
  }

  const scene = fresh(fields.scene);
  if (scene) {
    clauses.push({ slots: ['scene'], text: sentence(`Scene: ${scene}`) });
  }

  const camera = fresh(fields.camera);
  const lens = fresh(fields.lens);
  if (camera || lens) {
    const parts = [
      camera ? `Camera: ${camera}` : undefined,
      lens ? (camera ? `${lens} lens` : `Lens: ${lens}`) : undefined,
    ].filter(Boolean);
    clauses.push({
      slots: [
        ...(camera ? (['camera'] as const) : []),
        ...(lens ? (['lens'] as const) : []),
      ],
      text: sentence(parts.join(', ')),
    });
  }

  const movement = fresh(fields.cameraMovement);
  if (movement) {
    clauses.push({
      slots: ['cameraMovement'],
      text: sentence(`Camera movement: ${movement}`),
    });
  }

  const lighting = fresh(fields.lighting);
  if (lighting) {
    clauses.push({
      slots: ['lighting'],
      text: sentence(`Lighting: ${lighting}`),
    });
  }

  const style = fresh(fields.style);
  const mood = fresh(fields.mood);
  if (style || mood) {
    const parts = [
      style ? `Style: ${style}` : undefined,
      mood ? (style ? `${mood} mood` : `Mood: ${mood}`) : undefined,
    ].filter(Boolean);
    clauses.push({
      slots: [
        ...(style ? (['style'] as const) : []),
        ...(mood ? (['mood'] as const) : []),
      ],
      text: sentence(parts.join(', ')),
    });
  }

  if (hasAudio) {
    const sounds = (fields.sounds ?? []).filter(
      (sound) => !mentions(lead, sound),
    );
    if (sounds.length > 0) {
      clauses.push({
        slots: ['sounds'],
        text: sentence(`Audio: ${sounds.join(', ')}`),
      });
    }
    const speech = fresh(fields.speech);
    if (speech) {
      clauses.push({
        slots: ['speech'],
        text: sentence(`Spoken line: "${speech.replaceAll('"', "'")}"`),
      });
    }
  }

  return clauses;
}

function renderTagged(fields: StructuredPrompt, lead: string): Clause[] {
  const clauses: Clause[] = [];
  if (lead) {
    clauses.push({ slots: [], text: `<prompt>${escapeTagged(lead)}</prompt>` });
  }
  for (const slot of STRUCTURED_PROMPT_TEXT_SLOTS) {
    const value = fields[slot];
    if (value) {
      clauses.push({
        slots: [slot],
        text: `<${slot}>${escapeTagged(value)}</${slot}>`,
      });
    }
  }
  for (const slot of STRUCTURED_PROMPT_LIST_SLOTS) {
    const values = fields[slot];
    if (values && values.length > 0) {
      clauses.push({
        slots: [slot],
        text: `<${slot}>${escapeTagged(values.join(', '))}</${slot}>`,
      });
    }
  }
  return clauses;
}

/**
 * Render structured fields for one send. Deterministic: the same fields, lead
 * and options always produce the same text, so a stored rendering can be
 * compared with a new one.
 */
export function renderStructuredPrompt(
  input: StructuredPrompt,
  options: PromptRenderOptions = {},
): RenderedPrompt {
  const target = options.target ?? 'prose';
  const skipped = new Set<StructuredPromptSlot>(options.skip ?? []);
  const fields = normalizeStructuredPrompt(input);
  for (const slot of skipped) {
    delete fields[slot];
  }
  const lead = options.lead?.trim() ?? '';
  const negativePrompt = toNegativePrompt(fields.avoid);

  const clauses =
    target === 'tagged'
      ? renderTagged(fields, lead)
      : renderProse(fields, lead, options.hasAudio ?? false);

  const body = clauses.map((clause) => clause.text);
  const prompt =
    target === 'tagged'
      ? body.join('\n')
      : [body.length > 0 && lead ? closeSentence(lead) : lead, ...body]
          .filter(Boolean)
          .join(' ');

  const usedSlots = clauses.flatMap((clause) => clause.slots);
  return {
    prompt,
    target,
    usedSlots,
    ...(negativePrompt ? { negativePrompt } : {}),
  };
}
