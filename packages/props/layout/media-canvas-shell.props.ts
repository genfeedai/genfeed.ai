import type { AmbientWashIntensity } from '@props/ui/ambient-color-wash.props';
import type { ReactNode } from 'react';

export interface MediaCanvasShellProps {
  /** Full-bleed canvas content (grid, flow, single asset, …). */
  children: ReactNode;
  /** Convenience title rendered inside the standard floating glass pill. Ignored when `startSlot` is set. */
  title?: string;
  /** Secondary text shown next to `title` in the glass pill (e.g. "showing first 60"). */
  meta?: ReactNode;
  /** Custom leading toolbar content; replaces the default `title` pill entirely. */
  startSlot?: ReactNode;
  /** Trailing toolbar actions (ghost buttons), floated top-right. */
  actions?: ReactNode;
  /**
   * Dominant colour of the focused content for the ambient wash behind the canvas.
   * `null`/`undefined` disables the wash. Chrome is never tinted.
   */
  ambientColor?: string | null;
  /** Ambient wash strength. Defaults to `default`. */
  ambientIntensity?: AmbientWashIntensity;
  /** Apply the cinematic `gen-grain` + `gen-vignette` texture. Defaults to `true`. */
  hasTexture?: boolean;
  /** Extra classes on the floating toolbar row. */
  toolbarClassName?: string;
  /** Extra classes on the outer canvas container. */
  className?: string;
}
