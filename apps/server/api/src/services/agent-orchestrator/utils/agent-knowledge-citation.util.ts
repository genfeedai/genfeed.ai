import type {
  AgentKnowledgeCitation,
  KnowledgeReceipt,
} from '@genfeedai/contracts/interfaces';
import {
  isKnowledgeSearchPassage,
  toKnowledgeReceipt,
} from '@genfeedai/utils/knowledge/knowledge-receipt.util';

/** Most passages one turn can offer; matches the resolver's own bound. */
export const MAX_TURN_KNOWLEDGE_PASSAGES = 512;

const CITATION_MARKER = /\s?\[\[cite:([A-Za-z0-9_-]{1,128})\]\]/g;

export const KNOWLEDGE_CITATION_INSTRUCTION =
  'Cite a passage you rely on by writing [[cite:<passageId>]] right after the claim. Use only passageId values listed in this result; never write source titles, quotes or ids of your own.';

/** A passage the model was shown this turn, with the brand it was searched under. */
export interface TurnKnowledgePassage {
  brandId?: string;
  receipt: KnowledgeReceipt;
}

export type TurnKnowledgePassages = Map<string, TurnKnowledgePassage>;

/**
 * Gives each passage of a `search_knowledge` result an opaque id and records
 * the passage server-side. The model can only cite ids from this map, so text
 * it writes about a source never becomes a receipt.
 */
export function annotateKnowledgeSearchData(
  turn: { knowledgePassages?: TurnKnowledgePassages },
  data: Record<string, unknown>,
  brandId: string | undefined,
): { data: Record<string, unknown>; ids: string[] } | null {
  if (!Array.isArray(data.passages) || data.passages.length === 0) return null;
  const turnPassages: TurnKnowledgePassages =
    turn.knowledgePassages ?? new Map();
  const ids: string[] = [];
  const passages = data.passages.map((passage: unknown) => {
    if (
      !isKnowledgeSearchPassage(passage) ||
      turnPassages.size >= MAX_TURN_KNOWLEDGE_PASSAGES
    ) {
      return passage;
    }
    let next = turnPassages.size + 1;
    while (turnPassages.has(`p${next}`)) next += 1;
    const passageId = `p${next}`;
    turnPassages.set(passageId, {
      ...(brandId ? { brandId } : {}),
      receipt: toKnowledgeReceipt(passage),
    });
    ids.push(passageId);
    return { ...passage, passageId };
  });
  if (ids.length === 0) return null;
  turn.knowledgePassages = turnPassages;
  return {
    data: {
      ...data,
      citationInstruction: KNOWLEDGE_CITATION_INSTRUCTION,
      passages,
    },
    ids,
  };
}

/** Passage ids the answer cites, in order of first appearance. */
export function readCitedPassageIds(content: string): string[] {
  return [...content.matchAll(CITATION_MARKER)].map((match) => match[1]);
}

export function hasCitationMarkers(content: string): boolean {
  return readCitedPassageIds(content).length > 0;
}

/**
 * Rewrites verified markers to numbered `[n]` and removes the rest. A marker
 * the server could not verify is counted, never displayed.
 */
export function applyVerifiedCitations(
  content: string,
  receiptsById: ReadonlyMap<string, KnowledgeReceipt | null>,
): {
  citations: AgentKnowledgeCitation[];
  content: string;
  unsupportedCount: number;
} {
  const markerById = new Map<string, number>();
  const citations: AgentKnowledgeCitation[] = [];
  const unsupported = new Set<string>();
  const rewritten = content.replace(CITATION_MARKER, (_match, id: string) => {
    const receipt = receiptsById.get(id);
    if (!receipt) {
      unsupported.add(id);
      return '';
    }
    let marker = markerById.get(id);
    if (marker === undefined) {
      marker = citations.length + 1;
      markerById.set(id, marker);
      citations.push({ marker, receipt });
    }
    return ` [${marker}]`;
  });
  return { citations, content: rewritten, unsupportedCount: unsupported.size };
}

/** The brand a tool call was made for, when the model passed one. */
export function readBrandId(
  params: Record<string, unknown>,
): string | undefined {
  return typeof params.brandId === 'string' && params.brandId
    ? params.brandId
    : undefined;
}
