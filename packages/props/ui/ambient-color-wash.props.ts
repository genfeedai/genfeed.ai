export type AmbientWashIntensity = 'subtle' | 'default' | 'bold';

export interface AmbientColorWashProps {
  /**
   * CSS colour string (e.g. `rgb(120 80 200)`) derived from the focused content.
   * `null`/`undefined` renders nothing so the wash disables gracefully when no
   * media is focused.
   */
  color?: string | null;
  /** Wash strength. Opacity is resolved per-theme in CSS. Defaults to `default`. */
  intensity?: AmbientWashIntensity;
  /** Radial anchor: `top` (default) hangs the wash from the top edge; `center` blooms from the middle. */
  position?: 'top' | 'center';
  className?: string;
}
