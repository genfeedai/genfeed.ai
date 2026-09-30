import { BusinessLogicException } from '@api/exceptions/business-logic.exception';

export class ReservationEvidenceChangedException extends BusinessLogicException {
  constructor() {
    super(
      'Generation completion evidence changed; recompute settlement',
      undefined,
      'RESERVATION_EVIDENCE_CHANGED',
    );
  }
}
