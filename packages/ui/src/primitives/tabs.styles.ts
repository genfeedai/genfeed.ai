import { cn } from '@genfeedai/helpers';

export function getTabsListClassName(className?: string) {
  return cn(
    'inline-flex h-auto max-w-full items-center gap-1 overflow-x-auto text-foreground/70',
    className,
  );
}

export function getTabsTriggerClassName(className?: string) {
  return cn(
    'inline-flex h-9 min-w-9 shrink-0 items-center justify-center whitespace-nowrap rounded-none border border-input bg-transparent px-2 text-sm font-medium text-foreground shadow-sm transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    'hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-accent data-[state=active]:text-accent-foreground',
    className,
  );
}
