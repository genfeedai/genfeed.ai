import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';

/**
 * Base styling for quick-action controls that cannot render `QuickActionButton`
 * — dropdown triggers own their popover wiring and the overflow menu needs a
 * ref for portal positioning, so they render `ButtonVariant.UNSTYLED` and
 * borrow the shared base from here instead of re-declaring it per surface.
 *
 * Radius matches `QuickActionButton` (`rounded-md`). Quick actions are square
 * on every surface — never re-introduce a pill here or at a call site.
 */
export const QUICK_ACTION_TRIGGER_CLASS = cn(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  'disabled:pointer-events-none disabled:opacity-50',
  '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  'h-8 px-3 text-xs',
  'rounded-md transition-[background-color,color] duration-300',
);
