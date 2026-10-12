import type {
  ReplyVariantsResult,
  ReplyVariantTone,
  TextActionMode,
  TextActionResult,
} from '@genfeedai/contracts/interfaces';
import type { CaptureMode } from '~models/knowledge-capture.model';

// Extension message types for Remix / Reply / Idea flows

export type ExtensionMessageType = 'REMIX' | 'REPLY' | 'IDEA';

export interface ExtensionMessage {
  type: ExtensionMessageType;
  content: string;
  url: string;
  /** Author of the source post, when the page showed one. */
  author?: string;
  platform?: string;
  captureMode?: CaptureMode;
}

export type SocialPlatform =
  | 'twitter'
  | 'tiktok'
  | 'linkedin'
  | 'instagram'
  | 'youtube';

/** What the page or the side panel sends the background to draft reply options. */
export interface ReplyVariantsRequest {
  platform: string;
  postAuthor?: string;
  postContent: string;
  /** UUID per user request: a repeat is answered from the first result. */
  requestKey: string;
  tone: ReplyVariantTone;
  /** How many options to return; the server defaults and caps it. */
  variants?: number;
}

export type ReplyVariantsResponse =
  | { success: true; result: ReplyVariantsResult }
  | { success: false; error: string };

/** What a page or the side panel sends the background to edit a draft. */
export interface TextActionRequest {
  mode: TextActionMode;
  platform: string;
  /** UUID per user request: a repeat is answered from the first result. */
  requestKey: string;
  text: string;
}

export type TextActionResponse =
  | { success: true; result: TextActionResult }
  | { success: false; error: string };

/** The part of a composer a text action reads and later replaces. */
export type ComposerTextScope = 'selection' | 'draft';

/** The composer text captured for a text action; held in the page, never sent as a handle. */
export interface ComposerTextSnapshot {
  element: HTMLElement;
  /** The whole draft when the snapshot was taken. */
  draft: string;
  /** Selection range of a contenteditable composer, restored on apply. */
  range?: Range;
  scope: ComposerTextScope;
  /** Selection offsets of a textarea or input composer. */
  selection?: { end: number; start: number };
  /** Text of `scope`: the selection, or the whole draft. */
  text: string;
}

/** A replacement that can still be undone while the draft is as it was left. */
export interface AppliedComposerText {
  element: HTMLElement;
  draftAfter: string;
  draftBefore: string;
}
