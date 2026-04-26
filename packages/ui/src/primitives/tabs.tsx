'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '../lib/utils';

const Tabs = TabsPrimitive.Root;

function getTabsListClassName(className?: string) {
  return cn(
    'ship-ui inline-flex h-auto items-center gap-1 text-muted',
    className,
  );
}

function getTabsTriggerClassName(className?: string) {
  return cn(
    'ship-ui inline-flex items-center justify-center whitespace-nowrap rounded-md text-[12px] font-medium transition-colors duration-200',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong',
    'disabled:pointer-events-none disabled:opacity-50',
    'data-[variant=default]:px-3 data-[variant=default]:py-2',
    'data-[variant=default]:text-muted data-[variant=default]:hover:bg-hover data-[variant=default]:hover:text-primary',
    'data-[variant=default]:data-[state=active]:bg-tertiary data-[variant=default]:data-[state=active]:text-primary',
    'data-[variant=pills]:min-h-8 data-[variant=pills]:rounded-xl data-[variant=pills]:px-3.5 data-[variant=pills]:py-2',
    'data-[variant=pills]:text-muted data-[variant=pills]:hover:bg-hover data-[variant=pills]:hover:text-primary',
    'data-[variant=pills]:data-[state=active]:bg-tertiary data-[variant=pills]:data-[state=active]:text-primary',
    'data-[variant=underline]:rounded-none data-[variant=underline]:border-b-2 data-[variant=underline]:border-transparent data-[variant=underline]:px-3 data-[variant=underline]:py-2',
    'data-[variant=underline]:text-muted data-[variant=underline]:hover:text-primary data-[variant=underline]:data-[state=active]:border-accent data-[variant=underline]:data-[state=active]:text-primary',
    'data-[variant=segmented]:rounded-lg data-[variant=segmented]:px-3.5 data-[variant=segmented]:py-2',
    'data-[variant=segmented]:text-muted data-[variant=segmented]:hover:bg-hover data-[variant=segmented]:hover:text-primary data-[variant=segmented]:data-[state=active]:bg-tertiary data-[variant=segmented]:data-[state=active]:text-primary',
    'data-[size=sm]:text-xs',
    'data-[size=sm]:data-[variant=pills]:min-h-8 data-[size=sm]:data-[variant=pills]:px-3 data-[size=sm]:data-[variant=pills]:py-1.5',
    'data-[size=sm]:data-[variant=underline]:px-3 data-[size=sm]:data-[variant=underline]:py-2',
    'data-[size=sm]:data-[variant=segmented]:px-3 data-[size=sm]:data-[variant=segmented]:py-1.5',
    className,
  );
}

const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={getTabsListClassName(className)}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={getTabsTriggerClassName(className)}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-strong focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export {
  getTabsListClassName,
  getTabsTriggerClassName,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
};
