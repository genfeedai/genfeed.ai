import type { ApprovalPost } from '@api/publish-approvals/publish-approval-contract.codec';
import type { ServerLogger } from '@api/server.dependencies';
import {
  formatMediaReadinessBlockers,
  readBlockingDiagnostics,
  readWarningDiagnostics,
} from '@api/services/media-readiness/media-readiness.evaluator';
import type {
  MediaAssessmentReason,
  MediaReadinessDiagnostic,
} from '@genfeedai/contracts/api-types/contracts';
import {
  type IMediaReadinessGate,
  type IPublishApproval,
  type IPublishApprovalDestination,
  isMediaPublishGate,
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
 * What the media gate hands back to an approval: readiness warnings plus the
 * classifier reasons (#4881) a reviewer should see. An approval is already a
 * human review, so assessment reasons inform it rather than block it.
 */
export type ApprovalMediaGateOutcome = {
  assessmentReasons: MediaAssessmentReason[];
  warnings: MediaReadinessDiagnostic[];
};

const EMPTY_OUTCOME: ApprovalMediaGateOutcome = {
  assessmentReasons: [],
  warnings: [],
};

/**
 * Runs before the approval exists, so an off-spec asset never reaches provider
 * dispatch. `error` diagnostics reject the approval; `warning` diagnostics and
 * any media assessment reasons are returned for the caller to carry on the
 * approval's provenance.
 *
 * The gate is optional: callers that construct the service without one
 * (self-host wiring, specs) keep the previous behaviour.
 */
export async function assertApprovalMediaReady(params: {
  destinations: readonly IPublishApprovalDestination[];
  gate: IMediaReadinessGate | undefined;
  logger: ServerLogger | undefined;
  post: ApprovalPost;
}): Promise<ApprovalMediaGateOutcome> {
  const assetIds = params.post.ingredients.map((ingredient) => ingredient.id);
  if (!params.gate || assetIds.length === 0) {
    return EMPTY_OUTCOME;
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

  const assessment = isMediaPublishGate(params.gate)
    ? await params.gate.assessPublishMedia({
        assetIds,
        organizationId: params.post.organizationId,
        platforms: [],
      })
    : null;
  return {
    assessmentReasons: assessment?.reasons ?? [],
    warnings: readWarningDiagnostics(report),
  };
}

/** Provenance for a newly created approval, carrying this attempt's warnings. */
export function withMediaWarningProvenance(
  provenance: Record<string, unknown> | undefined,
  outcome: ApprovalMediaGateOutcome,
): Record<string, unknown> {
  return {
    ...(provenance ?? {}),
    ...(outcome.warnings.length > 0
      ? { mediaReadinessWarnings: outcome.warnings }
      : {}),
    ...(outcome.assessmentReasons.length > 0
      ? { mediaAssessmentReasons: outcome.assessmentReasons }
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
  outcome: ApprovalMediaGateOutcome,
): IPublishApproval {
  const {
    mediaAssessmentReasons: _staleReasons,
    mediaReadinessWarnings: _staleWarnings,
    ...provenance
  } = approval.provenance;
  return {
    ...approval,
    provenance: withMediaWarningProvenance(provenance, outcome),
  };
}
