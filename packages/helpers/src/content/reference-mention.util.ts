import type {
  StudioReferenceMention,
  StudioReferenceMentionDocument,
  StudioReferenceMentionSource,
  StudioReferenceMentionValidation,
} from '@genfeedai/contracts/interfaces/studio/studio-reference-mention.interface';

const TOKEN_PREFIX = { audio: 'Audio', image: 'Image', video: 'Video' };

/** Merge independently managed upload/Library trays without regrouping by source.
 * Existing positions follow an explicit reorder within either source; new picks
 * append, including pending uploads whose ingredient id arrives later.
 */
export function reconcileReferenceMentionOrder(
  previous: readonly StudioReferenceMentionSource[],
  current: readonly StudioReferenceMentionSource[],
): StudioReferenceMentionSource[] {
  const byKey = new Map(current.map((item) => [item.key, item]));
  let keys = previous.map((item) => item.key).filter((key) => byKey.has(key));
  const existing = new Set(keys);
  for (const source of ['upload', 'library']) {
    const reordered = current
      .filter((item) => item.source === source && existing.has(item.key))
      .map((item) => item.key);
    let position = 0;
    keys = keys.map((key) =>
      byKey.get(key)?.source === source ? (reordered[position++] ?? key) : key,
    );
  }
  keys.push(
    ...current
      .filter((item) => !existing.has(item.key))
      .map((item) => item.key),
  );
  return keys.flatMap((key) => {
    const item = byKey.get(key);
    return item ? [item] : [];
  });
}

export function numberReferenceMentions(
  references: readonly StudioReferenceMentionSource[],
): StudioReferenceMention[] {
  const counts = { audio: 0, image: 0, video: 0 };
  const seen = new Set<string>();
  return references.flatMap((reference) => {
    if (!reference.id || seen.has(reference.id)) return [];
    seen.add(reference.id);
    counts[reference.kind] += 1;
    return [
      {
        ...reference,
        id: reference.id,
        token: `@${TOKEN_PREFIX[reference.kind]}${counts[reference.kind]}`,
      },
    ];
  });
}

export function findReferenceMentionTokens(text: string): RegExpMatchArray[] {
  return [...text.matchAll(/(?<![\w@])@(Image|Video|Audio)\d+\b/g)];
}

export function validateReferenceMentions(
  text: string,
  references: readonly StudioReferenceMention[],
  document?: StudioReferenceMentionDocument | null,
): StudioReferenceMentionValidation {
  const byToken = new Map(
    references.map((reference) => [reference.token, reference]),
  );
  const byKey = new Map(
    references.map((reference) => [reference.key, reference]),
  );
  const tokens = new Set(
    findReferenceMentionTokens(text).map((match) => match[0]),
  );
  const errors = new Set<string>();
  for (const token of tokens) {
    if (!byToken.has(token))
      errors.add(
        `${token} has no attached reference. Attach it or remove the token.`,
      );
  }
  // A removed chip retains its identity even if another attachment now occupies
  // its old number: never silently bind that chip to a different asset.
  function walk(node: StudioReferenceMentionDocument): void {
    if (
      node.type === 'referenceMention' &&
      typeof node.attrs?.label === 'string' &&
      tokens.has(node.attrs.label)
    ) {
      const reference =
        typeof node.attrs?.key === 'string'
          ? byKey.get(node.attrs.key)
          : undefined;
      if (!reference || reference.id !== node.attrs?.id)
        errors.add(
          `${node.attrs?.label ?? 'Reference'} was removed. Reattach it or remove the chip.`,
        );
    }
    node.content?.forEach(walk);
  }
  if (document) walk(document);
  return {
    errors: [...errors],
    unusedTokens: references
      .filter((reference) => !tokens.has(reference.token))
      .map((reference) => reference.token),
  };
}

/** Old drafts retain their existing uploads-first order. Invalid persisted
 * values also fall back to that stable position rather than changing a slot.
 */
export function restoreReferenceMentionOrder(
  references: readonly StudioReferenceMentionSource[],
): StudioReferenceMentionSource[] {
  function position(
    reference: StudioReferenceMentionSource,
    index: number,
  ): number {
    return typeof reference.order === 'number' &&
      Number.isInteger(reference.order) &&
      reference.order >= 0 &&
      reference.order <= 23
      ? reference.order
      : index;
  }
  return references
    .map((reference, index) => ({ reference, index }))
    .sort(
      (left, right) =>
        position(left.reference, left.index) -
          position(right.reference, right.index) || left.index - right.index,
    )
    .map(({ reference }) => reference);
}
