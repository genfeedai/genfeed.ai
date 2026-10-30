import type { IIngredient, IPrompt } from '@genfeedai/contracts/interfaces';
import type { StudioPlaygroundType } from '@/features/studio/playground/types';

export const STUDIO_PROMPT_SLOT_KEYS = [
  'subject',
  'action',
  'scene',
  'style',
  'mood',
  'camera',
  'cameraMovement',
  'lens',
  'lighting',
  'sounds',
  'speech',
  'blacklists',
] as const;

export type StudioPromptSlotKey = (typeof STUDIO_PROMPT_SLOT_KEYS)[number];

export interface StudioStoredPromptSlot {
  key: StudioPromptSlotKey;
  value: string;
}

/** What a generation's prompt row stored: its slots and the text the model was sent. */
export interface StudioStoredPrompt {
  renderedPrompt?: string;
  renderTarget?: string;
  slots: StudioStoredPromptSlot[];
}

const AUDIO_SLOT_KEYS: ReadonlySet<StudioPromptSlotKey> = new Set([
  'sounds',
  'speech',
]);

/** The prompt row behind a generation, when the API sent it as a record. */
export function readStoredPromptRow(
  ingredient: IIngredient | null | undefined,
): IPrompt | null {
  const prompt = ingredient?.prompt;
  return prompt && typeof prompt === 'object' ? prompt : null;
}

function readSlotText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const entries = value
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => entry.trim())
      .filter(Boolean);
    return entries.length > 0 ? entries.join(', ') : undefined;
  }

  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A single slot as text, read from a prompt row. Empty slots read as undefined. */
export function readStoredSlotText(
  prompt: IPrompt | null | undefined,
  key: StudioPromptSlotKey,
): string | undefined {
  return prompt ? readSlotText(prompt[key]) : undefined;
}

/**
 * Sounds and speech only apply where the model makes audio: never to an image,
 * and on a video only while audio is turned on.
 */
export function isStudioPromptSlotVisible(
  key: StudioPromptSlotKey,
  type: StudioPlaygroundType,
  isAudioEnabled: boolean,
): boolean {
  if (!AUDIO_SLOT_KEYS.has(key)) {
    return true;
  }
  if (type === 'image' || type === 'image-edit') {
    return false;
  }
  return type === 'video' ? isAudioEnabled : true;
}

/**
 * The filled slots of a generation's prompt row, plus the prose the model was
 * sent for them. Null when the row stored neither (older generations).
 */
export function readStoredPrompt(
  ingredient: IIngredient | null | undefined,
  type: StudioPlaygroundType,
  isAudioEnabled: boolean,
): StudioStoredPrompt | null {
  const prompt = readStoredPromptRow(ingredient);
  if (!prompt) {
    return null;
  }

  const slots = STUDIO_PROMPT_SLOT_KEYS.flatMap((key) => {
    const value = readStoredSlotText(prompt, key);
    return value && isStudioPromptSlotVisible(key, type, isAudioEnabled)
      ? [{ key, value }]
      : [];
  });
  const renderedPrompt = readSlotText(prompt.renderedPrompt);
  if (slots.length === 0 && !renderedPrompt) {
    return null;
  }

  const renderTarget = readSlotText(prompt.renderTarget);
  return {
    ...(renderedPrompt ? { renderedPrompt } : {}),
    ...(renderTarget ? { renderTarget } : {}),
    slots,
  };
}
