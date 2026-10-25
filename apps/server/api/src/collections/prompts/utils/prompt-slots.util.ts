import {
  type StructuredPromptSource,
  structuredPromptFromSource,
} from '@api/services/prompt-builder/utils/structured-prompt.util';
import type { PromptRenderTarget } from '@genfeedai/harness';

/** The slot columns of a prompt row, as saved from a generation request. */
export interface PromptSlotColumns {
  action?: string;
  blacklists?: string[];
  camera?: string;
  cameraMovement?: string;
  lens?: string;
  lighting?: string;
  mood?: string;
  scene?: string;
  sounds?: string[];
  speech?: string;
  style?: string;
  subject?: string;
}

/** A prompt row's record of the text that was sent for its slots. */
export interface PromptRenderRecord {
  renderTarget: PromptRenderTarget;
  renderedPrompt: string;
}

/**
 * The request's structured slots as prompt columns. Empty slots are left out,
 * so a column only exists when the person (or the agent) filled the slot.
 */
export function promptSlotColumns(
  source: StructuredPromptSource,
): PromptSlotColumns {
  const { avoid, ...slots } = structuredPromptFromSource(source);
  return { ...slots, ...(avoid ? { blacklists: avoid } : {}) };
}

/** Media models are sent prose; the sent text is stored next to the slots it came from. */
export function promptRenderRecord(sentPrompt: string): PromptRenderRecord {
  return { renderTarget: 'prose', renderedPrompt: sentPrompt };
}
