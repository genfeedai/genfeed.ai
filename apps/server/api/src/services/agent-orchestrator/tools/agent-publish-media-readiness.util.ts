import {
  formatMediaReadinessBlockers,
  readBlockingDiagnostics,
  readWarningDiagnostics,
} from '@api/services/media-readiness/media-readiness.evaluator';
import { parsePlatform } from '@genfeedai/contracts';
import type { MediaReadinessDiagnostic } from '@genfeedai/contracts/api-types/contracts/media-readiness.contract';
import type {
  AgentPublishTargetMedia,
  AgentToolResult,
  IMediaReadinessGate,
} from '@genfeedai/contracts/interfaces';

/**
 * Deterministic media readiness for the agent publish tools (#4878).
 *
 * Kept out of `AgentPublishToolHandler` because that file is under the
 * decomposition ratchet (#519/#520) and may only shrink.
 */

export type AgentPublishMediaGate = {
  /** Attached asset ids, for the publish policy's media assessment (#4881). */
  assetIds: string[];
  /** The tool result to return instead of publishing, or null to proceed. */
  blockedResult: AgentToolResult | null;
  /** Warning diagnostics for the publish card, as a spreadable fragment. */
  cardData: { mediaDiagnostics?: MediaReadinessDiagnostic[] };
};

/**
 * Evaluate the attached media and translate the report into what the publish
 * tool needs: a refusal, or the warnings to show on the card.
 */
export async function resolveAgentPublishMediaGate(params: {
  contentId: string;
  gate: IMediaReadinessGate | undefined;
  media: readonly AgentPublishTargetMedia[];
  organizationId: string;
  platforms: readonly string[];
}): Promise<AgentPublishMediaGate> {
  const assetIds = params.media.flatMap((item) => (item.id ? [item.id] : []));
  const platforms = params.platforms.flatMap((platform) => {
    const parsed = parsePlatform(platform);
    return parsed ? [parsed] : [];
  });
  if (!params.gate || assetIds.length === 0 || platforms.length === 0) {
    return { assetIds, blockedResult: null, cardData: {} };
  }

  const report = await params.gate.evaluatePublishReadiness({
    assetIds,
    organizationId: params.organizationId,
    platforms,
  });
  const blockers = readBlockingDiagnostics(report);
  if (blockers.length > 0) {
    return {
      assetIds,
      blockedResult: {
        creditsUsed: 0,
        data: { contentId: params.contentId, mediaDiagnostics: blockers },
        error: formatMediaReadinessBlockers(blockers),
        success: false,
      },
      cardData: {},
    };
  }

  const warnings = readWarningDiagnostics(report);
  return {
    assetIds,
    blockedResult: null,
    cardData: warnings.length > 0 ? { mediaDiagnostics: warnings } : {},
  };
}
