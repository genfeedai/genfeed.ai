'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarContainerProps } from '@genfeedai/props/ui/content/prompt-bar-container.props';

const MAX_WIDTH_CLASSES: Record<string, string> = {
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
  '7xl': 'max-w-7xl',
  full: 'max-w-full',
  lg: 'max-w-lg',
  md: 'max-w-md',
  sm: 'max-w-sm',
  xl: 'max-w-xl',
};

/**
 * PromptBarContainer - Reusable positioning wrapper for prompt bars across the application
 *
 * Provides consistent fixed bottom-center positioning with proper pointer-events handling.
 * The content (children) should handle its own styling, glassmorphism, and collapse logic.
 *
 * @example
 * ```tsx
 * // Wrap existing PromptBar component
 * <PromptBarContainer>
 *   <PromptBar {...promptBarProps} />
 * </PromptBarContainer>
 * ```
 *
 * @example
 * ```tsx
 * // Custom max-width
 * <PromptBarContainer maxWidth="6xl">
 *   <CustomPromptBar />
 * </PromptBarContainer>
 * ```
 *
 * @example
 * ```tsx
 * // With custom z-index
 * <PromptBarContainer zIndex={100}>
 *   <SearchBar />
 * </PromptBarContainer>
 * ```
 */
export default function PromptBarContainer({
  children,
  className = '',
  isVisible = true,
  showTopFade = false,
  topContent,
  topFadeClassName = '',
  zIndex = 10,
  maxWidth = '4xl',
  layoutMode = 'fixed',
}: PromptBarContainerProps) {
  // Don't render if not visible
  if (!isVisible) {
    return null;
  }

  const maxWidthClass = MAX_WIDTH_CLASSES[maxWidth];
  const rootClassName = cn(
    layoutMode === 'fixed' &&
      'fixed bottom-0 left-0 right-0 pointer-events-none',
    layoutMode === 'surface-fixed' &&
      'absolute bottom-0 left-0 right-0 pointer-events-none',
    layoutMode === 'inflow' && 'relative w-full',
    layoutMode === 'inflow-desktop' &&
      'fixed bottom-0 left-0 right-0 pointer-events-none md:static md:pointer-events-auto',
    className,
  );

  const innerClassName = cn(
    'mx-auto pointer-events-auto',
    maxWidthClass,
    layoutMode === 'fixed' && 'px-5 pb-5',
    layoutMode === 'surface-fixed' && 'px-3 pb-3',
    layoutMode === 'inflow' && 'px-0 pb-0',
    layoutMode === 'inflow-desktop' && 'px-5 pb-5 md:px-0 md:pb-0',
  );

  return (
    <div
      className={rootClassName}
      data-layout-mode={layoutMode}
      data-max-width={maxWidth}
      style={{
        paddingBottom:
          layoutMode === 'fixed' ||
          layoutMode === 'inflow-desktop' ||
          layoutMode === 'surface-fixed'
            ? 'max(env(safe-area-inset-bottom), 0px)'
            : undefined,
        zIndex,
      }}
    >
      {showTopFade ? (
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-x-0 bottom-full h-20 bg-gradient-to-t from-background to-transparent opacity-100 transition-opacity duration-300',
            layoutMode === 'surface-fixed' && 'h-16',
            topFadeClassName,
          )}
        />
      ) : null}
      <div className={cn(innerClassName, topContent && 'flex flex-col')}>
        {topContent ? <div className="w-full">{topContent}</div> : null}
        {children}
      </div>
    </div>
  );
}
