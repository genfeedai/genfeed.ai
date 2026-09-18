import type {
  GenerationContextReceipt,
  SelectedGenerationContext,
} from '@genfeedai/contracts/interfaces';

export const SELECTED_CONTEXT_MAX_TEXT_LENGTH = 8000;
export const SELECTED_CONTEXT_MAX_SOURCE_IDS = 8;

export function readSelectedGenerationContext(
  value: unknown,
): SelectedGenerationContext | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const sourceIds = Array.isArray(record.sourceIds)
    ? record.sourceIds.filter(
        (entry): entry is string =>
          typeof entry === 'string' && entry.trim().length > 0,
      )
    : undefined;
  const text =
    typeof record.text === 'string' && record.text.trim().length > 0
      ? record.text.trim()
      : undefined;
  const persist = record.persist === true ? true : undefined;
  if (!sourceIds?.length && !text && !persist) {
    return undefined;
  }
  return {
    ...(persist ? { persist: true } : {}),
    ...(sourceIds && sourceIds.length > 0 ? { sourceIds } : {}),
    ...(text ? { text } : {}),
  };
}

export function assertSelectedContextLimits(
  context: SelectedGenerationContext,
): string | undefined {
  if (context.persist) {
    return 'Task context is transient. Save it with capture_knowledge if it should become reusable Knowledge.';
  }
  if (context.text && context.text.length > SELECTED_CONTEXT_MAX_TEXT_LENGTH) {
    return `selectedContext.text exceeds ${SELECTED_CONTEXT_MAX_TEXT_LENGTH} characters.`;
  }
  if (
    context.sourceIds &&
    context.sourceIds.length > SELECTED_CONTEXT_MAX_SOURCE_IDS
  ) {
    return `selectedContext.sourceIds exceeds ${SELECTED_CONTEXT_MAX_SOURCE_IDS} entries.`;
  }
  return undefined;
}

export function applyTaskContextToPrompt(
  prompt: string,
  context: SelectedGenerationContext | undefined,
): string {
  const text = context?.text?.trim();
  if (!text) {
    return prompt;
  }
  return `Task context:\n${text}\n\n${prompt}`;
}

export function buildGenerationContextReceipt(input: {
  brandId: string;
  sourceIds?: string[];
  text?: string;
}): GenerationContextReceipt {
  return {
    brandId: input.brandId,
    isPersisted: false,
    sources: [
      ...(input.text
        ? [{ kind: 'task_text' as const, title: 'Task context' }]
        : []),
      ...(input.sourceIds ?? []).map((id) => ({
        id,
        kind: 'knowledge_source' as const,
      })),
      { id: input.brandId, kind: 'brand' as const },
    ],
  };
}
