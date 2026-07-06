import { cn } from '../lib/utils';

export function getTabsListClassName(className?: string) {
  return cn(
    'ship-ui inline-flex h-auto items-center gap-1 text-foreground/70',
    className,
  );
}

export function getTabsTriggerClassName(className?: string) {
  return cn(
    'ship-ui inline-flex items-center justify-center whitespace-nowrap rounded-md text-[12px] font-medium transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
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
