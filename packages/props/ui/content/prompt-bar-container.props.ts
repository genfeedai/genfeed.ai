import type { ReactNode } from 'react';

/**
 * Props for the PromptBarContainer component
 * A reusable positioning wrapper for prompt bars across the application
 */
export interface PromptBarContainerProps {
  /**
   * Content to display (typically a PromptBar or custom bar component)
   * The children should handle their own styling, glassmorphism, and collapse logic
   */
  children: ReactNode;

  /**
   * Optional content rendered above the promptbar children.
   * Used for banners and other surface-level chrome.
   */
  topContent?: ReactNode;

  /**
   * Whether to render a fading scrim above the prompt bar surface so
   * scrolled content eases into the fixed composer instead of hard-cutting.
   * @default false
   */
  showTopFade?: boolean;

  /**
   * Optional className override for the top fade scrim.
   */
  topFadeClassName?: string;

  /**
   * Additional className for customization
   */
  className?: string;

  /**
   * Whether to show the container
   * Useful for conditional rendering
   * @default true
   */
  isVisible?: boolean;

  /**
   * z-index value for the fixed positioned container
   * @default 10
   */
  zIndex?: number;

  /**
   * Maximum width of the centered container
   * @default "4xl"
   */
  maxWidth?:
    | 'sm'
    | 'md'
    | 'lg'
    | 'xl'
    | '2xl'
    | '3xl'
    | '4xl'
    | '5xl'
    | '6xl'
    | '7xl'
    | 'full';

  /**
   * Layout behavior for prompt bar positioning.
   * - fixed: viewport overlay at bottom
   * - inflow: reserved space in normal layout flow
   * - inflow-desktop: fixed on mobile, in-flow on desktop
   * - surface-fixed: anchored to the nearest relative container instead of the viewport
   * @default "fixed"
   */
  layoutMode?: 'fixed' | 'inflow' | 'inflow-desktop' | 'surface-fixed';
}
