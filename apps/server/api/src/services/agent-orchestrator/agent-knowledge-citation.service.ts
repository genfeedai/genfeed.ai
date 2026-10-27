import {
  KnowledgeConflictLookupService,
  type KnowledgeConflictSide,
} from '@api/collections/contexts/services/knowledge-conflict-lookup.service';
import { KnowledgeReceiptVerifierService } from '@api/collections/contexts/services/knowledge-receipt-verifier.service';
import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  applyVerifiedCitations,
  hasCitationMarkers,
  readCitedPassageIds,
  type TurnKnowledgePassages,
} from '@api/services/agent-orchestrator/utils/agent-knowledge-citation.util';
import { resolveAgentKnowledgeReceipts } from '@api/services/agent-orchestrator/utils/agent-knowledge-receipt-resolution.util';
import {
  KnowledgeSourceKind,
  KnowledgeSourcePurpose,
} from '@genfeedai/contracts';
import type {
  AgentKnowledgeCitation,
  AgentKnowledgeCitations,
  AgentKnowledgeConflict,
  AgentKnowledgeConflictSource,
  KnowledgeReceipt,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

/** Conflicts shown under one answer; the rest are one tap away in Knowledge. */
const MAX_CONFLICTS_SHOWN = 3;

export interface FinalizedAgentCitations {
  content: string;
  /** Present only when the answer carried citation markers. */
  knowledgeCitations?: AgentKnowledgeCitations;
}

/**
 * Turns the citation markers in a final answer into numbered sources the user
 * can trust. Only passages the server showed the model this turn can be cited,
 * and each is re-checked against what the acting user may read at the end of
 * the turn, so a source corrected or hidden mid-turn is dropped, not shown.
 */
@Injectable()
export class AgentKnowledgeCitationService {
  constructor(
    private readonly verifier: KnowledgeReceiptVerifierService,
    private readonly conflictLookup: KnowledgeConflictLookupService,
  ) {}

  async finalize(
    content: string,
    turnPassages: TurnKnowledgePassages | undefined,
    context: Pick<
      AgentChatContext,
      'apiKeyContext' | 'organizationId' | 'scope' | 'userId'
    >,
  ): Promise<FinalizedAgentCitations> {
    if (!hasCitationMarkers(content)) return { content };

    const receiptsById = await this.resolve(
      readCitedPassageIds(content),
      turnPassages ?? new Map(),
      context,
    );
    const applied = applyVerifiedCitations(content, receiptsById);
    const conflicts = await this.readConflicts(
      applied.citations,
      turnPassages ?? new Map(),
      context,
    );
    return {
      content: applied.content,
      knowledgeCitations: {
        citations: applied.citations,
        ...(conflicts.length > 0 ? { conflicts } : {}),
        unsupportedCount: applied.unsupportedCount,
      },
    };
  }

  /**
   * Open conflicts that involve a cited source, with both sides. The uncited
   * side is re-checked against what the asking user may read, so a conflict
   * never reveals a source the user could not have cited. A failed lookup
   * shows no conflicts; it never blocks the answer.
   */
  private async readConflicts(
    citations: AgentKnowledgeCitation[],
    turnPassages: TurnKnowledgePassages,
    context: Pick<
      AgentChatContext,
      'apiKeyContext' | 'organizationId' | 'scope' | 'userId'
    >,
  ): Promise<AgentKnowledgeConflict[]> {
    if (citations.length === 0) return [];
    try {
      const markerByVersion = new Map(
        citations.map(({ marker, receipt }) => [receipt.versionId, marker]),
      );
      const brandByVersion = new Map<string, string | undefined>();
      for (const passage of turnPassages.values())
        brandByVersion.set(passage.receipt.versionId, passage.brandId);

      const open = await this.conflictLookup.findOpenForVersions(
        context.organizationId,
        [...markerByVersion.keys()],
      );
      const shown: AgentKnowledgeConflict[] = [];
      for (const row of open) {
        if (shown.length >= MAX_CONFLICTS_SHOWN) break;
        const citedSide = markerByVersion.has(row.a.versionId) ? row.a : row.b;
        const actor = {
          ...context.apiKeyContext,
          brandId:
            brandByVersion.get(citedSide.versionId) ?? context.scope?.brandId,
          organizationId: context.organizationId,
          userId: context.userId,
        };
        const sides = await Promise.all(
          [row.a, row.b].map(async (side) => {
            const marker = markerByVersion.get(side.versionId);
            if (marker !== undefined) return toConflictSource(side, marker);
            const readable = await this.verifier.revalidate(
              actor,
              toSyntheticReceipt(side),
            );
            return readable
              ? toConflictSource({ ...side, title: readable.title })
              : null;
          }),
        );
        const [first, second] = sides;
        if (first && second) {
          shown.push({
            id: row.id,
            sources: [first, second],
            summary: row.summary,
          });
        }
      }
      return shown;
    } catch {
      return [];
    }
  }

  private async resolve(
    cited: string[],
    turnPassages: TurnKnowledgePassages,
    context: Pick<
      AgentChatContext,
      'apiKeyContext' | 'organizationId' | 'scope' | 'userId'
    >,
  ): Promise<Map<string, KnowledgeReceipt | null>> {
    const unique = [...new Set(cited)];
    const retrieved = new Map<string, KnowledgeReceipt>();
    for (const [id, passage] of turnPassages)
      retrieved.set(id, passage.receipt);
    try {
      const resolved = await resolveAgentKnowledgeReceipts(
        unique,
        retrieved,
        (id, receipt) =>
          this.verifier.revalidate(
            {
              ...context.apiKeyContext,
              brandId: turnPassages.get(id)?.brandId ?? context.scope?.brandId,
              organizationId: context.organizationId,
              userId: context.userId,
            },
            receipt,
          ),
      );
      return new Map(unique.map((id, index) => [id, resolved[index]]));
    } catch {
      // Over the resolver's bounds: show no sources rather than a partial set.
      return new Map(unique.map((id) => [id, null]));
    }
  }
}

function toConflictSource(
  side: KnowledgeConflictSide,
  marker?: number,
): AgentKnowledgeConflictSource {
  return {
    excerpt: side.excerpt,
    ...(marker === undefined ? {} : { marker }),
    sourceId: side.sourceId,
    title: side.title,
    version: side.version,
    versionId: side.versionId,
  };
}

/** The receipt shape the verifier re-checks; kind and purpose come from the database. */
function toSyntheticReceipt(side: KnowledgeConflictSide): KnowledgeReceipt {
  return {
    excerpt: side.excerpt,
    kind: KnowledgeSourceKind.TEXT,
    purpose: KnowledgeSourcePurpose.BRAND_TRUTH,
    relevance: 0,
    sourceId: side.sourceId,
    title: side.title,
    version: side.version,
    versionId: side.versionId,
  };
}
