import { KnowledgeReceiptVerifierService } from '@api/collections/contexts/services/knowledge-receipt-verifier.service';
import type { AgentChatContext } from '@api/services/agent-orchestrator/interfaces/agent-chat.interface';
import {
  applyVerifiedCitations,
  hasCitationMarkers,
  readCitedPassageIds,
  type TurnKnowledgePassages,
} from '@api/services/agent-orchestrator/utils/agent-knowledge-citation.util';
import { resolveAgentKnowledgeReceipts } from '@api/services/agent-orchestrator/utils/agent-knowledge-receipt-resolution.util';
import type {
  AgentKnowledgeCitations,
  KnowledgeReceipt,
} from '@genfeedai/contracts/interfaces';
import { Injectable } from '@nestjs/common';

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
  constructor(private readonly verifier: KnowledgeReceiptVerifierService) {}

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
    return {
      content: applied.content,
      knowledgeCitations: {
        citations: applied.citations,
        unsupportedCount: applied.unsupportedCount,
      },
    };
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
