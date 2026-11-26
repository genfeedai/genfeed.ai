'use client';

import { createContext, useContext } from 'react';

/**
 * The slot in the output pane's header. A `SectionTopbar` inside the output
 * pane renders its controls here instead of as a bar of its own, so a pane has
 * one bar under the topbar, never a header with a second bar beneath it.
 *
 * `null` means "not inside an output pane"; `{ slot: null }` means inside one
 * whose slot has not mounted yet.
 */
export interface OutputPaneHeaderValue {
  slot: HTMLElement | null;
}

export const OutputPaneHeaderContext =
  createContext<OutputPaneHeaderValue | null>(null);

export function useOutputPaneHeader(): OutputPaneHeaderValue | null {
  return useContext(OutputPaneHeaderContext);
}
