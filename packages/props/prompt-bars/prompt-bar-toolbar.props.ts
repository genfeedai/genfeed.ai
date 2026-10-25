import type { ReactNode } from 'react';

export interface PromptBarToolbarProps {
  className?: string;
  /** Left group, first: what the bar does (Agent mode, Studio type and Auto / Advanced). */
  mode?: ReactNode;
  /** Left group, after mode: the surface's own setup chips. */
  leading?: ReactNode;
  /** Left group, after the setup chips: improve the prompt (action or settings). */
  enhance?: ReactNode;
  /** Left group, last: the `+` that adds references. */
  reference?: ReactNode;
  leadingLabel?: string;
  /** Right group: price and the submit slot. */
  trailing: ReactNode;
  trailingLabel?: string;
}

export interface PromptBarSubmitSlotProps {
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
