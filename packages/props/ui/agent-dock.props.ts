import type { ReactNode } from 'react';

/** What a page can hand the agent dock's composer: one canonical record. */
export interface AgentDockContentReference {
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

export interface AgentDockProviderProps {
  readonly children: ReactNode;
}

export interface AgentDockProps {
  /** The conversation; `null` until the dock has been opened once. */
  readonly children: ReactNode;
  /** Receives the composer slot; `undefined` while an overlay owns the composer. */
  readonly composerSlotRef?: (element: HTMLElement | null) => void;
  readonly dock: AgentDockContextValue;
  /** Below `xl` the dock renders as a bottom sheet. */
  readonly isCompact: boolean;
  readonly onOpenFullPage: () => void;
  /** Organization and brand scope for the conversation, plus page context chips. */
  readonly scopeControls?: ReactNode;
  readonly threadTitle?: string | null;
}
