'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentPropsWithRef } from 'react';
import { cn } from '../lib/utils';
import { getTabsListClassName, getTabsTriggerClassName } from './tabs.styles';

const Tabs: typeof TabsPrimitive.Root = TabsPrimitive.Root;

function TabsList({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={getTabsListClassName(className)}
      {...props}
    />
  );
}
TabsList.displayName = TabsPrimitive.List.displayName;

function TabsTrigger({
  ref,
  className,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) {
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
        'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  );
}
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
