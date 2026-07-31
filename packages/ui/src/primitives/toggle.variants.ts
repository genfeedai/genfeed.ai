import { cva } from 'class-variance-authority';

/**
 * Toggle / segmented control variants.
 *
 * Icon size is size-tiered (not a single global):
 * - `sm` → chrome icons (size-3.5) for toolbars / shell
 * - `default` / `lg` → content icons (size-4)
 */
export const toggleVariants = cva(
  'inline-flex items-center justify-center gap-2 text-sm font-medium transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 data-[state=on]:bg-accent data-[state=on]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    defaultVariants: {
      size: 'default',
      variant: 'default',
    },
    variants: {
      size: {
        default: 'h-9 min-w-9 px-2 [&_svg]:size-4',
        lg: 'h-10 min-w-10 px-2.5 [&_svg]:size-4',
        sm: 'h-8 min-w-8 px-1.5 [&_svg]:size-3.5',
      },
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-transparent shadow-sm hover:bg-accent hover:text-accent-foreground',
      },
    },
  },
);
