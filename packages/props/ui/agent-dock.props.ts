import type { ReactNode } from 'react';

/** What a page can hand the agent dock's composer: one canonical record. */
export interface AgentDockContentReference {
  /** The brand the record belongs to; the shell stamps its binding if absent. */
  readonly brandId?: string;
  readonly contentTitle: string;
  readonly contentType: string;
  readonly id: string;
  readonly kind: 'ingredient' | 'post';
  readonly thumbnailUrl?: string;
}

/**
 * Registered by the workspace shell while it can host the dock: puts the
 * reference on the dock composer's draft and opens the dock.
 */
export type AgentDockAttachHandler = (
  reference: AgentDockContentReference,
) => void;

export interface AgentDockContextValue {
  /**
   * Attaches a record to the dock composer and opens the dock. Returns `false`
   * when no dock can host it (on `/agent`, or outside the workspace shell), so
   * the caller can fall back to the full conversation.
   */
  readonly attachContent: (reference: AgentDockContentReference) => boolean;
  readonly close: () => void;
  readonly height: number;
  /** The shell hosts a dock on this route (never on `/agent`). */
  readonly isAvailable: boolean;
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly registerAttachHandler: (
    handler: AgentDockAttachHandler,
  ) => () => void;
  readonly setHeight: (height: number) => void;
  readonly setIsAvailable: (isAvailable: boolean) => void;
  readonly toggle: () => void;
}

/** What the dock remembers per viewer: whether it is open, and its height. */
export interface AgentDockPersistedState {
  readonly height: number;
  readonly isOpen: boolean;
}

export interface AgentDockHeaderProps {
  readonly onClose: () => void;
  readonly onOpenFullPage: () => void;
  readonly threadTitle?: string | null;
  readonly title: ReactNode;
}

export interface AgentDockBodyOutletProps {
  /** The dock's single body node; the conversation stays rendered into it. */
  readonly body: HTMLElement;
}

export interface AgentDockProviderProps {
  readonly children: ReactNode;
}

export type AgentDockChrome = 'split' | 'bubble';

export interface AgentDockSuggestedAction {
  readonly id?: string;
  readonly label: string;
  readonly prompt: string;
}

export interface AgentDockProps {
  /** The conversation; `null` until the dock has been opened once. */
  readonly children: ReactNode;
  /**
   * `split` is the bottom panel. `bubble` hides that panel and presents a
   * compact page promptbar or chat bubble that opens a floating overlay.
   * Defaults to `split` so existing dock tests keep their original chrome.
   */
  readonly chrome?: AgentDockChrome;
  /** Receives the composer slot; `undefined` while an overlay owns the composer. */
  readonly composerSlotRef?: (element: HTMLElement | null) => void;
  readonly dock: AgentDockContextValue;
  /**
   * Studio/edit surfaces already own a major prompt bar. Bubble chrome then
   * uses a FAB instead of a second compact page promptbar.
   */
  readonly hasMajorPromptBar?: boolean;
  /** Below `xl` the dock renders as a bottom sheet. */
  readonly isCompact: boolean;
  readonly onOpenFullPage: () => void;
  /** Seeds the overlay composer from a compact-bar chip, then opens it. */
  readonly onSelectSuggestedAction?: (prompt: string) => void;
  readonly pagePlaceholder?: string;
  /** Organization and brand scope for the conversation, plus page context chips. */
  readonly scopeControls?: ReactNode;
  readonly suggestedActions?: readonly AgentDockSuggestedAction[];
  readonly threadTitle?: string | null;
}
