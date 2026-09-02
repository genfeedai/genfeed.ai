'use client';

import { cn } from '@genfeedai/helpers';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { DayPicker } from 'react-day-picker';

export type CalendarProps = ComponentProps<typeof DayPicker>;

/**
 * Shared calendar chrome for Datepicker / DateRangePicker.
 *
 * react-day-picker v9+ dropdown captions render a real <select> over a visual
 * caption_label + chevron. The library CSS hides the select (`opacity: 0;
 * position: absolute`). We do not import that CSS, so these classNames must
 * recreate the overlay — otherwise month/year text doubles and the down
 * chevron falls through as a right arrow.
 */
function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3 text-foreground', className)}
      classNames={{
        button_next: cn(
          'size-7 bg-transparent p-0 text-muted-foreground hover:text-foreground',
          'inline-flex items-center justify-center',
          'border border-border hover:border-border-strong',
          'hover:bg-accent transition-colors',
        ),
        button_previous: cn(
          'size-7 bg-transparent p-0 text-muted-foreground hover:text-foreground',
          'inline-flex items-center justify-center',
          'border border-border hover:border-border-strong',
          'hover:bg-accent transition-colors',
        ),
        // Visual label for both captionLayout="label" and the dropdown facade.
        caption_label: cn(
          'relative z-[1] inline-flex items-center gap-1',
          'whitespace-nowrap text-sm font-medium text-foreground',
        ),
        chevron: 'size-4 shrink-0 text-muted-foreground',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
          'size-9',
          '[&:has([aria-selected])]:bg-muted',
        ),
        day_button: cn(
          'size-9 p-0 font-normal',
          'inline-flex items-center justify-center',
          'hover:bg-accent hover:text-accent-foreground',
          'focus:outline-none focus:ring-2 focus:ring-ring',
          'transition-colors',
        ),
        disabled: 'text-muted-foreground opacity-50',
        // Invisible interactive select stretched over the caption_label.
        dropdown: cn(
          'absolute inset-0 z-[2] m-0 w-full cursor-pointer appearance-none',
          'border-0 bg-transparent p-0 opacity-0',
        ),
        dropdown_root: 'relative inline-flex items-center',
        dropdowns: 'relative inline-flex items-center gap-2',
        hidden: 'invisible',
        month: 'flex flex-col gap-4',
        // Leave room for absolute prev/next on the right.
        month_caption:
          'relative flex h-10 w-full items-center justify-center pr-16 pt-1',
        month_grid: 'w-full border-collapse',
        months: 'flex flex-col sm:flex-row gap-4',
        nav: 'absolute right-1 top-0 flex h-10 items-center gap-1',
        outside:
          'text-muted-foreground/60 aria-selected:bg-muted aria-selected:text-muted-foreground',
        range_end: '',
        range_middle: 'aria-selected:bg-muted aria-selected:text-foreground',
        range_start: '',
        selected:
          'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground',
        today: 'bg-accent text-accent-foreground',
        week: '',
        weekday:
          'w-9 p-2 text-center text-xs font-normal text-muted-foreground',
        weekdays: '',
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chevronClassName, orientation, size }) => {
          const iconClass = cn('size-4', chevronClassName);
          const iconSize = typeof size === 'number' ? size : 16;
          if (orientation === 'left') {
            return <ChevronLeft className={iconClass} size={iconSize} />;
          }
          if (orientation === 'down') {
            return <ChevronDown className={iconClass} size={iconSize} />;
          }
          if (orientation === 'up') {
            // Match stroke weight with Down rather than a different icon.
            return (
              <ChevronDown
                className={cn(iconClass, 'rotate-180')}
                size={iconSize}
              />
            );
          }
          return <ChevronRight className={iconClass} size={iconSize} />;
        },
        ...components,
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
