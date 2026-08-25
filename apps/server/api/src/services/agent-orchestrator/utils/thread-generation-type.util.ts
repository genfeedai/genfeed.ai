export type ThreadGenerationType = 'image' | 'video';

function isThreadGenerationType(value: unknown): value is ThreadGenerationType {
  return value === 'image' || value === 'video';
}

function readUiActions(metadata: unknown): unknown[] {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return [];
  }

  const uiActions = (metadata as { uiActions?: unknown }).uiActions;
  return Array.isArray(uiActions) ? uiActions : [];
}

/**
 * First image/video generation card in chronological metadata locks the thread.
 */
export function resolveLockedGenerationType(
  metadatas: readonly unknown[],
): ThreadGenerationType | null {
  for (const metadata of metadatas) {
    for (const action of readUiActions(metadata)) {
      if (!action || typeof action !== 'object' || Array.isArray(action)) {
        continue;
      }

      const record = action as {
        generationType?: unknown;
        type?: unknown;
      };
      if (
        record.type === 'generation_action_card' &&
        isThreadGenerationType(record.generationType)
      ) {
        return record.generationType;
      }
    }
  }

  return null;
}

export function generationTypeLockError(
  requested: ThreadGenerationType,
  locked: ThreadGenerationType | null,
): string | null {
  if (!locked || locked === requested) {
    return null;
  }

  return `This conversation is for ${locked} generation. Start a new chat to generate ${requested}.`;
}
