import type { BrandAccessActor } from '@api/authorization/brand-access/brand-access.service';
import type { CredentialPlatform } from '@genfeedai/contracts';
import type {
  ReplyVariantsResult,
  ReplyVariantTone,
  TextActionMode,
  TextActionResult,
  TextReceiptState,
} from '@genfeedai/contracts/interfaces';
import type { ThreadRepliesTone } from '@genfeedai/helpers/content/text-action/branded-content-prompt.helper';
import type { TextActionGate } from '@genfeedai/helpers/content/text-action/text-action-text.helper';

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
  | 'no_usable_draft'
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

export interface SocialContentRequestV1 {
  actor: BrandAccessActor;
  additionalContext?: string[];
  brandId: string;
  /** True for one multi-post thread; false for stand-alone posts. */
  isThread: boolean;
  knowledgeSourceIds?: string[];
  knowledgeSpaceIds?: string[];
  platform: string;
  /** Caller-owned UUID: a repeat returns the first result and is never charged again. */
  requestKey: string;
  topic: string;
  /** Stand-alone posts to write; ignored for a thread. */
  variants: number;
}

export interface ThreadRepliesRequestV1 {
  actor: BrandAccessActor;
  brandId: string;
  /** Total posts in the thread including the original. */
  count: number;
  /** The text of the post that starts the thread. */
  originalContent: string;
  /** Caller-owned UUID: a repeat returns the first result and is never charged again. */
  requestKey: string;
  tone: ThreadRepliesTone;
}

/** Posts a receipt-backed generation proposed; the receipt's draft artifact holds the exact text. */
export interface BrandedPostsResultV1 {
  postId: string;
  maxCharacters: number;
  platform: string;
  posts: string[];
  receiptId: string;
  receiptState: TextReceiptState;
}

export type BrandedPostsOutcomeV1 =
  | {
      kind: 'completed';
      /** True when this call reached the provider; a replay never does. */
      hasNewDispatch: boolean;
      result: BrandedPostsResultV1;
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
  /** Saved Knowledge sources the generation is grounded on, when the caller named any. */
  knowledgeSourceIds?: string[];
  knowledgeSpaceIds?: string[];
  /** The instruction the seam wraps with the brand context. */
  prompt: string;
  /** The text the learning receipt is resolved against. */
  sourceText: string;
  requestKey: string;
}

export type BrandedTextRunOutcomeV1 =
  | {
      kind: 'completed';
      postId: string;
      hasNewDispatch: boolean;
      isReplayed: boolean;
      receiptId: string;
      /** `ready` for the approved kit; `needs_review` while the brand runs on its provisional draft. */
      receiptState: TextReceiptState;
      /** The gate-normalized text that was saved. */
      text: string;
    }
  /** The provider answered but the gate refused it; the gate says why. */
  | { kind: 'rejected'; receiptId: string }
  | TextActionFailureV1;
