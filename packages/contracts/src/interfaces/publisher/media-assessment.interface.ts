import type { MediaAssessment } from '../../api-types/contracts/media-assessment.contract';
import type {
  IMediaReadinessGate,
  IMediaReadinessRequest,
} from './media-readiness.interface';

/**
 * The full media gate a publish path consults (#4881): the deterministic
 * readiness gate plus the assessment every classifier source feeds.
 * Extends the readiness port so existing callers keep working unchanged.
 */
export interface IMediaAssessmentRequest extends IMediaReadinessRequest {
  /** The post caption, for caption-consistency warnings (#4882). */
  caption?: string;
}

export interface IMediaPublishGate extends IMediaReadinessGate {
  assessPublishMedia(
    request: IMediaAssessmentRequest,
  ): Promise<MediaAssessment>;
}

export function isMediaPublishGate(
  gate: IMediaReadinessGate | undefined,
): gate is IMediaPublishGate {
  return (
    gate !== undefined &&
    typeof (gate as Partial<IMediaPublishGate>).assessPublishMedia ===
      'function'
  );
}
