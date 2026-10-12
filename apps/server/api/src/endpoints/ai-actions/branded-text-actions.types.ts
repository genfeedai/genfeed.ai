import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import type { TextActionGate } from '@api/endpoints/ai-actions/text-action-text.util';
import type { CredentialPlatform } from '@genfeedai/contracts';
import type {
  ReplyVariantsResult,
  ReplyVariantTone,
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

export interface ReplyVariantsRequestV1 {
  actor: BrandAccessActor;
  brandId: string;
  platform: string;
  postAuthor?: string;
  postContent: string;
  /** Caller-owned UUID: a repeat returns the first result and is never charged again. */
  requestKey: string;
  tone: ReplyVariantTone;
  variants: number;
}

/** Stable reasons a text action stops; the message is safe to show a user. */
export type TextActionFailureCode =
  | 'blocked'
  | 'in_progress'
  | 'limit_exceeded'
  | 'no_usable_reply'
  | 'provider_unavailable'
  | 'text_changed_meaning'
  | 'unsupported_platform';

export interface TextActionFailureV1 {
  kind: 'failed';
  code: TextActionFailureCode;
  message: string;
  /** Seam reason code when the saved receipt stopped the request. */
  reasonCode?: string;
  receiptId?: string;
}

export type TextActionOutcomeV1 =
  | {
      kind: 'completed';
      /** True when this call reached the provider; a replay never does. */
      hasNewDispatch: boolean;
      result: TextActionResult;
    }
  | TextActionFailureV1;

export type ReplyVariantsOutcomeV1 =
  | {
      kind: 'completed';
      /** True when this call reached the provider; a replay never does. */
      hasNewDispatch: boolean;
      result: ReplyVariantsResult;
    }
  | TextActionFailureV1;

/** One branded text generation, whatever the action: the prompt, the gate and the artifact label. */
export interface BrandedTextRunSpecV1 {
  actor: BrandAccessActor;
  brandId: string;
  contentType: 'post' | 'reply';
  /** The gate on the provider answer; its result is what the artifact saves. */
  gate: TextActionGate;
  generation: { maxTokens: number; temperature: number };
  /** Label of the draft post that holds the artifact. */
  label: string;
  platform: CredentialPlatform;
  /** The text the learning receipt is resolved against. */
  sourceText: string;
  promptFor: (hasBrandVoice: boolean) => string;
  requestKey: string;
}

export type BrandedTextRunOutcomeV1 =
  | {
      kind: 'completed';
      hasBrandVoice: boolean;
      hasNewDispatch: boolean;
      isReplayed: boolean;
      receiptId?: string;
      /** The gate-normalized text that was saved. */
      text: string;
    }
  /** The provider answered but the gate refused it; the gate says why. */
  | { kind: 'rejected'; receiptId?: string }
  | TextActionFailureV1;
