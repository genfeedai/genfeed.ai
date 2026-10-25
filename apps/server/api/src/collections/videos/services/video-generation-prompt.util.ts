import { HttpException, HttpStatus } from '@nestjs/common';

export const MISSING_PROMPT_ID_DETAIL =
  'Prompt resolution requires a prompt ID';

export function createMissingPromptIdException(): HttpException {
  return new HttpException(
    { detail: MISSING_PROMPT_ID_DETAIL, title: 'Prompt validation failed' },
    HttpStatus.BAD_REQUEST,
  );
}

export function requireVideoPromptInput(dto: {
  promptId?: unknown;
  text?: unknown;
}): boolean {
  return Boolean(dto.promptId || dto.text);
}

export function resolveInlinePromptText(
  promptId: unknown,
  text?: string,
): string | undefined {
  if (promptId) {
    return undefined;
  }

  return text || '';
}

export function hasStoredPromptId(
  prompt: {
    enhanced?: string | null;
    id?: string | null;
    original?: string | null;
  } | null,
): prompt is {
  enhanced?: string | null;
  id: string;
  original?: string | null;
} {
  return Boolean(prompt?.id);
}

export function resolveStoredPromptText(prompt: {
  enhanced?: string | null;
  original?: string | null;
}): string {
  return prompt.enhanced || prompt.original || '';
}
