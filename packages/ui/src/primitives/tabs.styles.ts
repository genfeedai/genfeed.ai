import { cn } from '@genfeedai/helpers';
import { controlHeightClassName } from '@ui/primitives/field-control';

export function getTabsListClassName(className?: string) {
  return cn(
    controlHeightClassName,
    'ml-auto flex w-fit max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-border bg-muted/50 p-0.5 text-foreground/70',
    className,
  );
}

export function getTabsTriggerClassName(className?: string) {
  return cn(
    'inline-flex h-full min-w-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md border-0 bg-transparent px-3 text-xs font-medium text-foreground/70 shadow-none transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    'disabled:pointer-events-none disabled:opacity-50',
    'hover:bg-accent hover:text-accent-foreground data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-accent-foreground',
    className,
  );
}
