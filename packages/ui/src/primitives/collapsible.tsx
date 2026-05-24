'use client';

import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../lib/utils';

const Collapsible = CollapsiblePrimitive.Root;

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
        'flex w-full items-center justify-between py-3 text-sm font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180',
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
    <CollapsiblePrimitive.Content
      ref={ref}
      className={cn(
        'overflow-hidden text-sm data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down',
        className,
      )}
      {...props}
    >
      <div className="pb-4 pt-0">{children}</div>
    </CollapsiblePrimitive.Content>
  );
}
CollapsibleContent.displayName = CollapsiblePrimitive.Content.displayName;

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
