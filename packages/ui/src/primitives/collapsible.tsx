'use client';

import { cn } from '@genfeedai/helpers';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';

const Collapsible: typeof CollapsiblePrimitive.Root = CollapsiblePrimitive.Root;

function CollapsibleTrigger({
  ref,
  className,
  children,
  showArrow = true,
  ...props
}: ComponentPropsWithRef<typeof CollapsiblePrimitive.Trigger> & {
  showArrow?: boolean;
}) {
  return (
    <CollapsiblePrimitive.Trigger
      ref={ref}
      className={cn(
        'flex w-full items-center justify-between py-3 text-sm font-medium transition-colors hover:underline [&[data-state=open]>svg]:rotate-180',
        className,
      )}
      {...props}
    >
      {children}
      {showArrow && (
        <ChevronDown className="size-4 shrink-0 transition-transform duration-200" />
      )}
    </CollapsiblePrimitive.Trigger>
  );
}
CollapsibleTrigger.displayName = CollapsiblePrimitive.Trigger.displayName;

function CollapsibleContent({
  ref,
  className,
  children,
  ...props
}: ComponentPropsWithRef<typeof CollapsiblePrimitive.Content>) {
  return (
    // grid-rows transition from @starting-style: interruptible (retargets from
    // the current height) and needs no keyframes; Radix unmounts on close.
    <CollapsiblePrimitive.Content
      ref={ref}
      className={cn(
        'grid grid-rows-[1fr] overflow-hidden text-sm transition-[grid-template-rows] duration-200 ease-out starting:grid-rows-[0fr]',
        className,
      )}
      {...props}
    >
      <div className="flex min-h-0 flex-col">
        <div className="pb-4 pt-0">{children}</div>
      </div>
    </CollapsiblePrimitive.Content>
  );
}
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
