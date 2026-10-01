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

/** One row in the dock's thread menu. */
export interface AgentDockThreadOption {
  readonly id: string;
  readonly title: string;
}

export interface AgentDockHeaderProps {
  readonly activeThreadId?: string | null;
  readonly isThreadListLoading?: boolean;
  readonly onClose: () => void;
  readonly onNewThread?: () => void;
  readonly onOpenFullPage: () => void;
  readonly onSelectThread?: (threadId: string) => void;
  readonly threadTitle?: string | null;
  readonly threads?: readonly AgentDockThreadOption[];
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
  readonly description?: string;
  readonly icon?: ReactNode;
  readonly id?: string;
  readonly label: string;
  readonly prompt: string;
}

export interface AgentDockProps {
  /** The conversation; `null` until the dock has been opened once. */
  readonly children: ReactNode;
  /**
   * `split` is the bottom panel. `bubble` hides that panel and presents a
   * chat bubble (with radial page shortcuts) that opens a floating overlay.
   * Defaults to `split` so existing dock tests keep their original chrome.
   */
  readonly chrome?: AgentDockChrome;
  /** Receives the composer slot; `undefined` while an overlay owns the composer. */
  readonly composerSlotRef?: (element: HTMLElement | null) => void;
  readonly dock: AgentDockContextValue;
  /**
   * Studio/edit surfaces already own a major prompt bar, so the closed bubble
   * stays a single control there. Other pages fan their shortcuts off it.
   */
  readonly hasMajorPromptBar?: boolean;
  /** Below `xl` the dock renders as a bottom sheet. */
  readonly isCompact: boolean;
  readonly onNewThread?: () => void;
  readonly onOpenFullPage: () => void;
  /** Opens a saved thread inside the dock without leaving the page. */
  readonly onSelectThread?: (threadId: string) => void;
  /** Seeds the overlay composer from a radial shortcut, then opens it. */
  readonly onSelectSuggestedAction?: (prompt: string) => void;
  /** Organization and brand scope for the conversation, plus page context chips. */
  readonly scopeControls?: ReactNode;
  readonly suggestedActions?: readonly AgentDockSuggestedAction[];
  readonly activeThreadId?: string | null;
  readonly isThreadListLoading?: boolean;
  readonly threadTitle?: string | null;
  readonly threads?: readonly AgentDockThreadOption[];
}
