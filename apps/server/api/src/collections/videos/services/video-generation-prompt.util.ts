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
