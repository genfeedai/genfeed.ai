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
  /** The shell hosts a dock on this route (never on `/agent`). */
  readonly isAvailable: boolean;
  readonly isOpen: boolean;
  readonly open: () => void;
  readonly registerAttachHandler: (
    handler: AgentDockAttachHandler,
  ) => () => void;
  readonly setIsAvailable: (isAvailable: boolean) => void;
  readonly toggle: () => void;
}

/** What the dock remembers per viewer: whether it is open, and its height. */
export interface AgentDockPersistedState {
  readonly isOpen: boolean;
}

/** One row in the dock's thread menu. */
export interface AgentDockThreadOption {
  readonly id: string;
  readonly title: string;
}

/** Thread picker shared by the panel tabs and the compact sheet header. */
export interface AgentDockThreadMenuProps {
  readonly activeThreadId?: string | null;
  readonly isThreadListLoading?: boolean;
  readonly onNewThread?: () => void;
  readonly onSelectThread?: (threadId: string) => void;
  readonly threadTitle?: string | null;
  readonly threads?: readonly AgentDockThreadOption[];
}

export interface AgentDockHeaderProps extends AgentDockThreadMenuProps {
  readonly onClose: () => void;
  readonly onOpenFullPage: () => void;
  readonly title: ReactNode;
}

export interface AgentDockBodyOutletProps {
  /** The dock's single body node; the conversation stays rendered into it. */
  readonly body: HTMLElement;
}

export interface AgentDockProviderProps {
  readonly children: ReactNode;
}

export interface AgentDockProps extends AgentDockThreadMenuProps {
  /** The conversation; `null` until the dock has been opened once. */
  readonly children: ReactNode;
  /** Receives the composer slot; `undefined` while an overlay owns the composer. */
  readonly composerSlotRef?: (element: HTMLElement | null) => void;
  readonly dock: AgentDockContextValue;
  /**
   * Whether the agent is the front tab of the side panel. A hidden agent tab
   * stays mounted so drafts and streams survive a switch to Details.
   */
  readonly isTabActive?: boolean;
  /** Below `xl` the panel renders as a bottom sheet. */
  readonly isCompact: boolean;
  readonly onOpenFullPage: () => void;
  /** Organization and brand scope for the conversation, plus page context chips. */
  readonly scopeControls?: ReactNode;
}
