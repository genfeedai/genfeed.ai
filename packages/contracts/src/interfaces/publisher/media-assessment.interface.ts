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
export interface IMediaPublishGate extends IMediaReadinessGate {
  assessPublishMedia(request: IMediaReadinessRequest): Promise<MediaAssessment>;
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
