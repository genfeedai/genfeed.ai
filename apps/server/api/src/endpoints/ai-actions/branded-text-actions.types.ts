import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import type {
  TextActionMode,
  TextActionResult,
} from '@genfeedai/contracts/interfaces';

export interface TextActionRequestV1 {
  actor: BrandAccessActor;
  brandId: string;
  mode: TextActionMode;
  platform: string;
  /** Caller-owned UUID: a repeat returns the first result and is never charged again. */
  requestKey: string;
  text: string;
}

/** Stable reasons a text action stops; the message is safe to show a user. */
export type TextActionFailureCode =
  | 'in_progress'
  | 'limit_exceeded'
  | 'provider_unavailable'
  | 'text_changed_meaning'
  | 'unsupported_platform'
  | 'blocked';

export type TextActionOutcomeV1 =
  | {
      kind: 'completed';
      /** True when this call reached the provider; a replay never does. */
      hasNewDispatch: boolean;
      result: TextActionResult;
    }
  | {
      kind: 'failed';
      code: TextActionFailureCode;
      message: string;
      /** Seam reason code when the saved receipt stopped the request. */
      reasonCode?: string;
      receiptId?: string;
    };
