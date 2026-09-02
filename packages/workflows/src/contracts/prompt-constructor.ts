import type { PromptFormat, PromptJsonValue } from '@genfeedai/contracts/types';

/**
 * Executor payload for prompt-constructor nodes.
 *
 * Text mode keeps a plain string so existing `prompt: string` consumers
 * continue to work. JSON mode always includes a string `prompt` (the
 * deterministic serializer output, or draft text when JSON is invalid) and
 * optionally a lossless `structuredPrompt` object.
 *
 * Model-aware compilation (whether a model accepts the object natively)
 * belongs to #1650 — this payload does not branch on model id.
 */
export type PromptConstructorTextPayload = string;

export interface PromptConstructorJsonPayload {
  prompt: string;
  promptFormat: Extract<PromptFormat, 'json'>;
  structuredPrompt?: PromptJsonValue;
}

export type PromptConstructorPayload =
  | PromptConstructorTextPayload
  | PromptConstructorJsonPayload;
