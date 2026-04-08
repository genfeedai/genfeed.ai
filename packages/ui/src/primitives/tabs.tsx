'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import { type ComponentPropsWithoutRef, forwardRef } from 'react';
import { cn } from '../lib/utils';

const Tabs = TabsPrimitive.Root;

const TabsList = forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex h-auto items-center gap-1 text-muted-foreground',
      className,
    )}
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
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-all duration-200',
      'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20',
      'disabled:pointer-events-none disabled:opacity-50',
      'data-[variant=default]:px-4 data-[variant=default]:pt-2.5 data-[variant=default]:pb-3.5',
      'data-[variant=default]:text-white/40 data-[variant=default]:hover:text-white/70',
      'data-[variant=default]:data-[state=active]:bg-white/10 data-[variant=default]:data-[state=active]:text-white',
      'data-[variant=pills]:min-h-10 data-[variant=pills]:rounded-xl data-[variant=pills]:px-3.5 data-[variant=pills]:py-2',
      'data-[variant=pills]:text-white/45 data-[variant=pills]:hover:bg-white/[0.04] data-[variant=pills]:hover:text-white/80',
      'data-[variant=pills]:data-[state=active]:bg-white/[0.1] data-[variant=pills]:data-[state=active]:text-white data-[variant=pills]:data-[state=active]:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]',
      'data-[variant=underline]:border-b-2 data-[variant=underline]:border-transparent data-[variant=underline]:px-4 data-[variant=underline]:py-2.5',
      'data-[variant=underline]:text-foreground/60 data-[variant=underline]:hover:text-foreground data-[variant=underline]:data-[state=active]:border-primary data-[variant=underline]:data-[state=active]:text-primary',
      'data-[variant=segmented]:rounded-lg data-[variant=segmented]:px-4 data-[variant=segmented]:py-2',
      'data-[variant=segmented]:text-muted-foreground data-[variant=segmented]:hover:text-foreground data-[variant=segmented]:data-[state=active]:bg-background data-[variant=segmented]:data-[state=active]:text-foreground data-[variant=segmented]:data-[state=active]:shadow-sm',
      'data-[size=sm]:text-xs',
      'data-[size=sm]:data-[variant=pills]:min-h-8 data-[size=sm]:data-[variant=pills]:px-3 data-[size=sm]:data-[variant=pills]:py-1.5',
      'data-[size=sm]:data-[variant=underline]:px-3 data-[size=sm]:data-[variant=underline]:py-2',
      'data-[size=sm]:data-[variant=segmented]:px-3 data-[size=sm]:data-[variant=segmented]:py-1.5',
      className,
    )}
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
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsContent, TabsList, TabsTrigger };
