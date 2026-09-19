import type { CredentialPlatform } from '../..';
import type {
  MediaProbe,
  MediaReadinessKind,
  MediaReadinessReport,
} from '../../api-types/contracts/media-readiness.contract';

/**
 * Ports for the deterministic media readiness gate (#4878).
 *
 * Publish paths depend on `IMediaReadinessGate` rather than the concrete API
 * service so the gate stays optional for callers constructed outside Nest DI
 * (the publish-approvals factory) and trivially fakeable in specs.
 */

/** One attached asset paired with whatever probe metadata it already carries. */
export interface IMediaReadinessAsset {
  assetId: string;
  kind: MediaReadinessKind;
  probe: MediaProbe | null;
}

/** Input to the pure evaluator: probed assets against the post's platforms. */
export interface IMediaReadinessEvaluationInput {
  assets: readonly IMediaReadinessAsset[];
  platforms: readonly CredentialPlatform[];
}

/** Input to the service: asset ids it resolves and probes itself. */
export interface IMediaReadinessRequest {
  assetIds: readonly string[];
  organizationId: string;
  platforms: readonly CredentialPlatform[];
}

export interface IMediaReadinessGate {
  evaluatePublishReadiness(
    request: IMediaReadinessRequest,
  ): Promise<MediaReadinessReport>;
}
