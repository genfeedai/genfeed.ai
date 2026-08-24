export interface CharacterMentionToken {
  handle: string;
  id: string;
  label: string;
}

export interface ResolvedCharacterReference {
  handle: string;
  id: string;
  label: string;
  notice?: string;
  referenceId?: string;
}

export function serializeCharacterMentionDisplayName(
  token: CharacterMentionToken,
): string {
  return token.label?.trim() || token.handle;
}

export function dedupeCharacterReferenceIds(
  existing: readonly string[],
  resolved: readonly string[],
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const id of [...existing, ...resolved]) {
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    merged.push(id);
  }
  return merged;
}
