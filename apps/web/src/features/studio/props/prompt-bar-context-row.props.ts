import type { ReactNode, RefObject } from 'react';

/** One chip in the composer's context row: a preset, an asset or an action. */
export interface PromptBarContextItem {
  id: string;
  label: string;
  /** Accessible name when it differs from the visible label. */
  ariaLabel?: string;
  icon?: ReactNode;
  /** Shows a square thumbnail instead of the icon. */
  thumbnailUrl?: string;
  /** Thumbnail-only chip; the label stays as its accessible name and tooltip. */
  isIconOnly?: boolean;
  isPressed?: boolean;
  onSelect: () => void;
  /** Adds a remove control, e.g. to unpin a preset or clear a selection. */
  onRemove?: () => void;
  removeLabel?: string;
}

export interface PromptBarContextChipProps {
  isCompact: boolean;
  item: PromptBarContextItem;
}

export interface PromptBarContextGroup {
  id: string;
  items: readonly PromptBarContextItem[];
  /** Muted lead-in text, hidden first when the row runs out of room. */
  label?: string;
}

export interface PromptBarContextRowProps {
  ariaLabel: string;
  groups: readonly PromptBarContextGroup[];
}

export interface UsePromptBarRowFitOptions {
  /** Changes whenever the row's content changes, so it is measured again. */
  contentKey: string;
  rowRef: RefObject<HTMLElement | null>;
}

export interface UsePromptBarRowFitReturn {
  /** True while the full row would overflow; chips then drop their labels. */
  isCompact: boolean;
}
