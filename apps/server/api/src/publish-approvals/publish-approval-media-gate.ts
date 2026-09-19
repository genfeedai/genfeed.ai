import type { ApprovalPost } from '@api/publish-approvals/publish-approval-contract.codec';
import type { ServerLogger } from '@api/server.dependencies';
import {
  formatMediaReadinessBlockers,
  readBlockingDiagnostics,
  readWarningDiagnostics,
} from '@api/services/media-readiness/media-readiness.evaluator';
import type { MediaReadinessDiagnostic } from '@genfeedai/contracts/api-types/contracts';
import type {
  IMediaReadinessGate,
  IPublishApproval,
  IPublishApprovalDestination,
} from '@genfeedai/contracts/interfaces';
import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * The deterministic media gate in front of a publish approval (#4878).
 *
 * Extracted from `PublishApprovalsService` so the service keeps the approval
 * lifecycle and this module owns how a readiness report becomes a rejection or
 * a set of warnings carried on the approval.
 */

/**
 * Raised when an attached asset breaks the target platform's published media
 * spec. Restates `detail` as the exception message, like the service's
 * not-found exception, so the reason survives logging and client surfaces.
 */
export class PublishApprovalMediaNotReadyException extends HttpException {
  constructor(
    detail: string,
    diagnostics: readonly MediaReadinessDiagnostic[],
  ) {
    super(
      {
        detail,
        diagnostics,
        title: 'Attached media does not meet the platform media spec',
      },
      HttpStatus.BAD_REQUEST,
    );
    this.message = detail;
  }
}

/**
 * Runs before the approval exists, so an off-spec asset never reaches provider
 * dispatch. `error` diagnostics reject the approval; `warning` diagnostics are
 * returned for the caller to carry on the approval's provenance.
 *
 * The gate is optional: callers that construct the service without one
 * (self-host wiring, specs) keep the previous behaviour.
 */
export async function assertApprovalMediaReady(params: {
  destinations: readonly IPublishApprovalDestination[];
  gate: IMediaReadinessGate | undefined;
  logger: ServerLogger | undefined;
  post: ApprovalPost;
}): Promise<MediaReadinessDiagnostic[]> {
  const assetIds = params.post.ingredients.map((ingredient) => ingredient.id);
  if (!params.gate || assetIds.length === 0) {
    return [];
  }

  const report = await params.gate.evaluatePublishReadiness({
    assetIds,
    organizationId: params.post.organizationId,
    platforms: params.destinations.map((destination) => destination.platform),
  });
  const blockers = readBlockingDiagnostics(report);
  if (blockers.length > 0) {
    params.logger?.warn('Publish approval blocked by media readiness', {
      diagnostics: blockers,
      postId: params.post.id,
    });
    throw new PublishApprovalMediaNotReadyException(
      formatMediaReadinessBlockers(blockers),
      blockers,
    );
  }

  return readWarningDiagnostics(report);
}

/** Provenance for a newly created approval, carrying this attempt's warnings. */
export function withMediaWarningProvenance(
  provenance: Record<string, unknown> | undefined,
  mediaWarnings: readonly MediaReadinessDiagnostic[],
): Record<string, unknown> {
  return {
    ...(provenance ?? {}),
    ...(mediaWarnings.length > 0
      ? { mediaReadinessWarnings: mediaWarnings }
      : {}),
  };
}

/**
 * A reused approval carries the warnings from when its scope was first
 * approved. This attempt re-evaluated the same assets, so the returned
 * approval reports the current diagnostics rather than a stale snapshot.
 */
export function withMediaWarnings(
  approval: IPublishApproval,
  mediaWarnings: readonly MediaReadinessDiagnostic[],
): IPublishApproval {
  if (mediaWarnings.length === 0) {
    const { mediaReadinessWarnings: _stale, ...provenance } =
      approval.provenance;
    return { ...approval, provenance };
  }
  return {
    ...approval,
    provenance: {
      ...approval.provenance,
      mediaReadinessWarnings: mediaWarnings,
    },
  };
}
