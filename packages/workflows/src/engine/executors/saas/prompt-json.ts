import type { PromptFormat, PromptJsonValue } from '@genfeedai/contracts/types';
import type { PromptConstructorJsonPayload } from '../../../contracts/prompt-constructor';

export const PROMPT_FORMAT_TEXT = 'text' as const satisfies PromptFormat;
export const PROMPT_FORMAT_JSON = 'json' as const satisfies PromptFormat;

export type PromptJsonParseResult =
  | {
      isValid: true;
      pretty: string;
      value: PromptJsonValue;
    }
  | {
      error: string;
      isValid: false;
    };

export function isPromptFormat(value: unknown): value is PromptFormat {
  return value === PROMPT_FORMAT_TEXT || value === PROMPT_FORMAT_JSON;
}

export function readPromptFormat(value: unknown): PromptFormat {
  return isPromptFormat(value) ? value : PROMPT_FORMAT_TEXT;
}

export function isPromptJsonValue(value: unknown): value is PromptJsonValue {
  if (value === null) {
    return true;
  }

  const valueType = typeof value;
  if (
    valueType === 'string' ||
    valueType === 'number' ||
    valueType === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isPromptJsonValue);
  }

  if (valueType === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      return false;
    }

    return Object.values(value as Record<string, unknown>).every(
      isPromptJsonValue,
    );
  }

  return false;
}

export function parsePromptJson(text: string): PromptJsonParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { error: 'JSON is empty', isValid: false };
  }

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isPromptJsonValue(parsed)) {
      return { error: 'JSON contains unsupported values', isValid: false };
    }

    return {
      isValid: true,
      pretty: prettyPrintPromptJson(parsed),
      value: parsed,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Invalid JSON',
      isValid: false,
    };
  }
}

export function prettyPrintPromptJson(value: PromptJsonValue): string {
  return JSON.stringify(value, null, 2);
}

/**
 * Deterministic text fallback for model paths that cannot accept structured
 * prompts natively (#1650). Keys are sorted recursively; arrays keep order;
 * output is compact (no whitespace) so the same object always serializes to
 * the same bytes.
 */
export function serializeStructuredPrompt(value: PromptJsonValue): string {
  return JSON.stringify(sortPromptJsonValue(value));
}

export function getPromptJsonWarning(text: string): string | null {
  return parsePromptJson(text).isValid ? null : 'Invalid JSON';
}

export function isPromptConstructorJsonPayload(
  value: unknown,
): value is PromptConstructorJsonPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.promptFormat === PROMPT_FORMAT_JSON &&
    typeof record.prompt === 'string'
  );
}

export function readPromptConstructorPrompt(data: unknown): string {
  if (typeof data === 'string') {
    return data;
  }

  if (isPromptConstructorJsonPayload(data)) {
    return data.prompt;
  }

  return '';
}

function sortPromptJsonValue(value: PromptJsonValue): PromptJsonValue {
  if (Array.isArray(value)) {
    return value.map(sortPromptJsonValue);
  }

  if (value !== null && typeof value === 'object') {
    const sorted: { [key: string]: PromptJsonValue } = {};
    for (const key of Object.keys(value).sort()) {
      const nested = value[key];
      if (nested === undefined) {
        continue;
      }
      sorted[key] = sortPromptJsonValue(nested);
    }
    return sorted;
  }

  return value;
}
