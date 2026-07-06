import { cn } from '../lib/utils';

export function getTabsListClassName(className?: string) {
  return cn(
    'ship-ui inline-flex h-auto items-center gap-1 text-secondary',
    className,
  );
}

export function getTabsTriggerClassName(className?: string) {
  return cn(
    'ship-ui inline-flex items-center justify-center whitespace-nowrap rounded-md text-[12px] font-medium transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[variant=default]:px-3 data-[variant=default]:py-2',
    'data-[variant=default]:text-secondary data-[variant=default]:hover:bg-hover data-[variant=default]:hover:text-primary',
    'data-[variant=default]:data-[state=active]:bg-tertiary data-[variant=default]:data-[state=active]:text-primary',
    'data-[variant=pills]:min-h-8 data-[variant=pills]:rounded-xl data-[variant=pills]:px-3.5 data-[variant=pills]:py-2',
    'data-[variant=pills]:text-secondary data-[variant=pills]:hover:bg-hover data-[variant=pills]:hover:text-primary',
    'data-[variant=pills]:data-[state=active]:bg-tertiary data-[variant=pills]:data-[state=active]:text-primary',
    'data-[variant=underline]:rounded-none data-[variant=underline]:border-b-2 data-[variant=underline]:border-transparent data-[variant=underline]:px-3 data-[variant=underline]:py-2',
    'data-[variant=underline]:text-secondary data-[variant=underline]:hover:text-primary data-[variant=underline]:data-[state=active]:border-accent data-[variant=underline]:data-[state=active]:text-primary',
    'data-[variant=segmented]:rounded-lg data-[variant=segmented]:px-3.5 data-[variant=segmented]:py-2',
    'data-[variant=segmented]:text-secondary data-[variant=segmented]:hover:bg-hover data-[variant=segmented]:hover:text-primary data-[variant=segmented]:data-[state=active]:bg-tertiary data-[variant=segmented]:data-[state=active]:text-primary',
    'data-[size=sm]:text-xs',
    'data-[size=sm]:data-[variant=pills]:min-h-8 data-[size=sm]:data-[variant=pills]:px-3 data-[size=sm]:data-[variant=pills]:py-1.5',
    'data-[size=sm]:data-[variant=underline]:px-3 data-[size=sm]:data-[variant=underline]:py-2',
    'data-[size=sm]:data-[variant=segmented]:px-3 data-[size=sm]:data-[variant=segmented]:py-1.5',
    className,
  );
}
