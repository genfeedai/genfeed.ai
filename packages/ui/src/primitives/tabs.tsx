'use client';

import { cn } from '@genfeedai/helpers';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithRef } from 'react';
import { getTabsListClassName, getTabsTriggerClassName } from './tabs.styles';

const Tabs: typeof TabsPrimitive.Root = TabsPrimitive.Root;

type TabsListProps = ComponentPropsWithRef<typeof TabsPrimitive.List> & {
  'data-variant'?: 'default' | 'pills' | 'segmented' | 'underline';
};

function TabsList({
  ref,
  className,
  'data-variant': dataVariant,
  ...props
}: TabsListProps) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={getTabsListClassName(className, dataVariant)}
      data-variant={dataVariant}
      {...props}
    />
  );
}
TabsList.displayName = TabsPrimitive.List.displayName;

// React allows arbitrary `data-*` in JSX but not on a destructured props
// object, so the two attributes tabs.styles.ts reads are declared explicitly.
// The variant names mirror the `data-[variant=…]` rules in that file.
type TabsTriggerProps = ComponentPropsWithRef<typeof TabsPrimitive.Trigger> & {
  'data-size'?: 'md' | 'sm';
  'data-variant'?: 'default' | 'pills' | 'segmented' | 'underline';
};

function TabsTrigger({ ref, className, ...props }: TabsTriggerProps) {
  // Styles in tabs.styles.ts are gated on data-variant / data-size. The
  // enhanced navigation Tabs always set these; bare @radix TabsTrigger
  // consumers must default them or every tab looks like plain text + focus ring.
  const {
    'data-variant': dataVariant = 'default',
    'data-size': dataSize,
    ...rest
  } = props;

  return (
    <TabsPrimitive.Trigger
      ref={ref}
      data-variant={dataVariant}
      data-size={dataSize}
      className={getTabsTriggerClassName(className)}
      {...rest}
    />
  );
}
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

function TabsContent({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  );
}
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
