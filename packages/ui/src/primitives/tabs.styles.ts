import { cn } from '@genfeedai/helpers';

type TabsListVariant = 'default' | 'pills' | 'segmented' | 'underline';

export function getTabsListClassName(
  className?: string,
  variant?: TabsListVariant,
) {
  return cn(
    'inline-flex h-auto items-center gap-0.5 text-foreground/70',
    variant === undefined &&
      'rounded-md border border-border bg-muted/40 p-0.5',
    variant === 'default' && 'gap-0.5',
    variant === 'pills' && 'rounded-2xl bg-secondary/60 p-1 shadow-border',
    variant === 'underline' && 'gap-0 border-b border-border',
    variant === 'segmented' && 'rounded-xl bg-secondary/50 p-1 shadow-border',
    className,
  );
}

export function getTabsTriggerClassName(className?: string) {
  return cn(
    'inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[variant=default]:px-3 data-[variant=default]:py-2',
    'data-[variant=default]:text-foreground/70 data-[variant=default]:hover:bg-accent data-[variant=default]:hover:text-foreground',
    'data-[variant=default]:data-[state=active]:bg-background-tertiary data-[variant=default]:data-[state=active]:text-foreground',
    'data-[variant=pills]:min-h-8 data-[variant=pills]:rounded-xl data-[variant=pills]:px-3.5 data-[variant=pills]:py-2',
    'data-[variant=pills]:text-foreground/70 data-[variant=pills]:hover:bg-accent data-[variant=pills]:hover:text-foreground',
    'data-[variant=pills]:data-[state=active]:bg-background-tertiary data-[variant=pills]:data-[state=active]:text-foreground',
    'data-[variant=underline]:rounded-none data-[variant=underline]:border-b-2 data-[variant=underline]:border-transparent data-[variant=underline]:px-3 data-[variant=underline]:py-2',
    'data-[variant=underline]:text-foreground/70 data-[variant=underline]:hover:text-foreground data-[variant=underline]:data-[state=active]:border-foreground data-[variant=underline]:data-[state=active]:text-foreground',
    'data-[variant=segmented]:rounded-lg data-[variant=segmented]:px-3.5 data-[variant=segmented]:py-2',
    'data-[variant=segmented]:text-foreground/70 data-[variant=segmented]:hover:bg-accent data-[variant=segmented]:hover:text-foreground data-[variant=segmented]:data-[state=active]:bg-background-tertiary data-[variant=segmented]:data-[state=active]:text-foreground',
    'data-[size=sm]:text-xs',
    'data-[size=sm]:data-[variant=pills]:min-h-8 data-[size=sm]:data-[variant=pills]:px-3 data-[size=sm]:data-[variant=pills]:py-1.5',
    'data-[size=sm]:data-[variant=underline]:px-3 data-[size=sm]:data-[variant=underline]:py-2',
    'data-[size=sm]:data-[variant=segmented]:px-3 data-[size=sm]:data-[variant=segmented]:py-1.5',
    className,
  );
}
