import type { KnowledgeReceipt } from '@genfeedai/contracts/interfaces';

const MAX_REQUESTED_REFERENCES = 128;
const MAX_RETRIEVED_PASSAGES = 512;
const MAX_PASSAGE_ID_LENGTH = 128;
const INVALID_PASSAGE_ID_CHARACTER = /[^A-Za-z0-9_-]/;

function isValidPassageId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_PASSAGE_ID_LENGTH &&
    !INVALID_PASSAGE_ID_CHARACTER.test(value)
  );
}

/**
 * Resolves references only from a server-owned current-turn passage map.
 * The callback owns current tenant/audience eligibility and safe metadata;
 * this helper preserves retrieved identity and contains validation failures.
 * Mounting callers must handle defensive limit failures visibly.
 */
export async function resolveAgentKnowledgeReceipts(
  requestedIds: readonly string[],
  retrievedById: ReadonlyMap<string, KnowledgeReceipt>,
  revalidate: (
    passageId: string,
    receipt: Readonly<KnowledgeReceipt>,
  ) => Promise<KnowledgeReceipt | null>,
): Promise<(KnowledgeReceipt | null)[]> {
  if (
    requestedIds.length > MAX_REQUESTED_REFERENCES ||
    retrievedById.size > MAX_RETRIEVED_PASSAGES
  ) {
    throw new RangeError('knowledge_citation_resolution_limit_exceeded');
  }

  const requested = [...requestedIds];
  const retrieved = new Map<string, Readonly<KnowledgeReceipt>>();
  for (const [id, receipt] of retrievedById) {
    if (!isValidPassageId(id)) {
      throw new Error('knowledge_citation_resolution_invalid_input');
    }
    // Existing receipt fields are scalar; isolate every input before awaits.
    retrieved.set(id, Object.freeze({ ...receipt }));
  }

  const resolvedById = new Map<string, KnowledgeReceipt | null>();
  const results: (KnowledgeReceipt | null)[] = [];
  for (const id of requested) {
    const receipt = isValidPassageId(id) ? retrieved.get(id) : undefined;
    if (!receipt) {
      results.push(null);
      continue;
    }
    if (!resolvedById.has(id)) {
      const { sourceId, versionId, version } = receipt;
      let resolved: KnowledgeReceipt | null = null;
      try {
        const current = await revalidate(id, receipt);
        if (
          current !== null &&
          current.sourceId === sourceId &&
          current.versionId === versionId &&
          current.version === version
        ) {
          resolved = current;
        }
      } catch {
        // Never leak callback errors or infer eligibility during an outage.
      }
      resolvedById.set(id, resolved);
    }
    results.push(resolvedById.get(id) ?? null);
  }
  return results;
}
