import type { PromptBuilderParams } from '@api/services/prompt-builder/interfaces/prompt-builder-params.interface';
import {
  normalizeStructuredPrompt,
  STRUCTURED_PROMPT_LIST_SLOTS,
  STRUCTURED_PROMPT_TEXT_SLOTS,
  type StructuredPrompt,
  type StructuredPromptSlot,
} from '@genfeedai/harness';

/** The request fields that fill the slots of a structured prompt. */
export type StructuredPromptSource = Pick<
  PromptBuilderParams,
  | 'action'
  | 'blacklist'
  | 'camera'
  | 'cameraMovement'
  | 'lens'
  | 'lighting'
  | 'mood'
  | 'scene'
  | 'sounds'
  | 'speech'
  | 'style'
  | 'subject'
>;

export function structuredPromptFromSource(
  source: StructuredPromptSource,
): StructuredPrompt {
  return normalizeStructuredPrompt({
    action: source.action,
    avoid: source.blacklist,
    camera: source.camera,
    cameraMovement: source.cameraMovement,
    lens: source.lens,
    lighting: source.lighting,
    mood: source.mood,
    scene: source.scene,
    sounds: source.sounds,
    speech: source.speech,
    style: source.style,
    subject: source.subject,
  });
}

const TEMPLATE_SLOTS: readonly StructuredPromptSlot[] = [
  ...STRUCTURED_PROMPT_TEXT_SLOTS,
  ...STRUCTURED_PROMPT_LIST_SLOTS,
];

/**
 * The slots a prompt template already places itself (`{{mood}}`,
 * `{{#if camera}}`), so rendering the structured fields does not say them twice.
 */
export function slotsUsedByTemplate(
  templateContent: string | undefined,
): StructuredPromptSlot[] {
  if (!templateContent) {
    return [];
  }
  const placeholders = templateContent.match(/\{\{[^}]*\}?\}\}/g) ?? [];
  return TEMPLATE_SLOTS.filter((slot) => {
    // `avoid` is the negative prompt: templates call it `blacklist`.
    const name = slot === 'avoid' ? 'blacklist' : slot;
    const pattern = new RegExp(`\\b${name}\\b`);
    return placeholders.some((placeholder) => pattern.test(placeholder));
  });
}
