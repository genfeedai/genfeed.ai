import {
  formatMediaReadinessBlockers,
  readBlockingDiagnostics,
  readWarningDiagnostics,
} from '@api/services/media-readiness/media-readiness.evaluator';
import { parsePlatform } from '@genfeedai/contracts';
import type { MediaReadinessDiagnostic } from '@genfeedai/contracts/api-types/contracts/media-readiness.contract';
import type { IMediaReadinessGate } from '@genfeedai/contracts/interfaces';

/**
 * Deterministic media readiness for the agent publish tools (#4878).
 *
 * Kept out of `AgentPublishToolHandler` because that file is under the
 * decomposition ratchet (#519/#520) and may only shrink.
 */

export type AgentPublishMediaReadiness = {
  blockers: MediaReadinessDiagnostic[];
  /** Operator-facing reason, empty when nothing blocks. */
  error: string;
  warnings: MediaReadinessDiagnostic[];
};

const NO_DIAGNOSTICS: AgentPublishMediaReadiness = {
  blockers: [],
  error: '',
  warnings: [],
};

export async function resolveAgentPublishMediaReadiness(params: {
  assetIds: readonly string[];
  gate: IMediaReadinessGate | undefined;
  organizationId: string;
  platforms: readonly string[];
}): Promise<AgentPublishMediaReadiness> {
  const platforms = params.platforms.flatMap((platform) => {
    const parsed = parsePlatform(platform);
    return parsed ? [parsed] : [];
  });
  if (!params.gate || params.assetIds.length === 0 || platforms.length === 0) {
    return NO_DIAGNOSTICS;
  }

  const report = await params.gate.evaluatePublishReadiness({
    assetIds: params.assetIds,
    organizationId: params.organizationId,
    platforms,
  });
  const blockers = readBlockingDiagnostics(report);
  return {
    blockers,
    error: formatMediaReadinessBlockers(blockers),
    warnings: readWarningDiagnostics(report),
  };
}
