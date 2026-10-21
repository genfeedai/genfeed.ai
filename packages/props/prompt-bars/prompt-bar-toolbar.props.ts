import type { ReactNode } from 'react';

export interface PromptBarToolbarProps {
  className?: string;
  density?: 'compact' | 'default';
  /** Left group: `+` menu, the surface's leading chip, then surface tools. */
  leading: ReactNode;
  leadingLabel?: string;
  /** Right group: setup, enhance, then the submit slot. */
  trailing: ReactNode;
  trailingLabel?: string;
}

export interface PromptBarSubmitSlotProps {
  density?: 'compact' | 'default';
  isDisabled?: boolean;
  /** Nothing to submit yet — the mic owns the slot when voice is available. */
  isEmpty: boolean;
  isListening: boolean;
  isTranscribing: boolean;
  /** Org Voice Control is on and the browser can record. */
  isVoiceAvailable: boolean;
  onStartListening: () => void;
  onStop?: () => void;
  onStopListening: () => void;
  /** The surface's own send control; `null` hides it (e.g. nothing to queue during a run). */
  send: ReactNode;
  /** A run is in flight: Stop takes the slot and the mic steps out. */
  showStop?: boolean;
  stopLabel?: string;
}
