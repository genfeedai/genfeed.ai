import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { ReactNode } from 'react';
import PromptBarBody from './PromptBarBody';
import PromptBarShell, {
  PROMPT_BAR_SURFACE_CLASS,
  type PromptBarShellProps,
} from './PromptBarShell';

export interface PromptBarComposerProps extends PromptBarShellProps {
  beforeBody?: ReactNode;
  bodyClassName?: string;
  density?: 'compact' | 'default';
  /**
   * One-line resting pill while the page scrolls under the bar (see
   * `usePromptBarResting`). Ignored while a banner is showing.
   */
  isResting?: boolean;
  /** Called when focus or a press inside the resting bar should open it. */
  onExpand?: () => void;
}

/**
 * Resting layout: the editor and the send controls share one row, the editor
 * clips to a single line, and the setup tools, context tray and inline
 * notices step aside until the bar opens again.
 */
const RESTING_BODY_CLASS = cn(
  'flex items-center gap-2 py-1.5',
  '[&>*:not([data-prompt-editor]):not([data-prompt-bar-toolbar])]:hidden',
  '[&>[data-prompt-editor]]:min-w-0 [&>[data-prompt-editor]]:flex-1',
  '[&_.ProseMirror]:!min-h-8 [&_.ProseMirror]:!max-h-8 [&_.ProseMirror]:overflow-hidden [&_.ProseMirror]:whitespace-nowrap [&_.ProseMirror]:leading-8 [&_.ProseMirror]:!py-0',
  '[&>[data-prompt-bar-toolbar]]:mt-0 [&>[data-prompt-bar-toolbar]]:min-h-0 [&>[data-prompt-bar-toolbar]]:flex-none [&>[data-prompt-bar-toolbar]]:flex-nowrap',
  '[&_[data-prompt-bar-leading]]:hidden',
);

/**
 * Canonical composer surface used by Agent, Studio, and content generation.
 * Placement belongs to PromptBarContainer; this component owns only the glass
 * shell, optional context tray, and editor/toolbar inset.
 */
export default function PromptBarComposer({
  banner,
  beforeBody,
  bodyClassName,
  children,
  className,
  density = 'default',
  isResting = false,
  onExpand,
  ...props
}: PromptBarComposerProps) {
  const isRestingVisible = isResting && !banner;
  // Handlers attach only while resting, so server-rendered previews stay valid RSC output.
  const shouldExpandOnPress = isRestingVisible && onExpand !== undefined;

  return (
    <PromptBarShell
      data-testid="prompt-bar-composer"
      {...props}
      banner={banner}
      className={cn(PROMPT_BAR_SURFACE_CLASS, className)}
      data-prompt-bar-composer=""
      data-resting={isRestingVisible ? 'true' : undefined}
      onFocusCapture={
        shouldExpandOnPress
          ? (event) => {
              props.onFocusCapture?.(event);
              onExpand();
            }
          : props.onFocusCapture
      }
      onPointerDownCapture={
        shouldExpandOnPress
          ? (event) => {
              props.onPointerDownCapture?.(event);
              onExpand();
            }
          : props.onPointerDownCapture
      }
    >
      {isRestingVisible ? null : beforeBody}
      <PromptBarBody
        className={cn(bodyClassName, isRestingVisible && RESTING_BODY_CLASS)}
        density={density}
      >
        {children}
      </PromptBarBody>
    </PromptBarShell>
  );
}
