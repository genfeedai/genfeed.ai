'use client';

import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ComponentProps } from 'react';
import { DayPicker } from 'react-day-picker';
import { cn } from '../lib/utils';

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
      className={cn('p-3', className)}
      classNames={{
        button_next: cn(
          'size-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          'inline-flex items-center justify-center',
          'border border-white/[0.08] hover:border-white/20',
          'hover:bg-white/5 transition-colors',
        ),
        button_previous: cn(
          'size-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          'inline-flex items-center justify-center',
          'border border-white/[0.08] hover:border-white/20',
          'hover:bg-white/5 transition-colors',
        ),
        // Visual label for both captionLayout="label" and the dropdown facade.
        caption_label: cn(
          'relative z-[1] inline-flex items-center gap-1',
          'whitespace-nowrap text-sm font-medium text-white/90',
        ),
        chevron: 'size-4 shrink-0 text-white/70',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
          'size-9',
          props.mode === 'range'
            ? '[&:has([aria-selected])]:bg-white/5 first:[&:has([aria-selected])]: last:[&:has([aria-selected])]:'
            : '[&:has([aria-selected])]: [&:has([aria-selected])]:bg-white/5',
        ),
        day_button: cn(
          'size-9 p-0 font-normal',
          'inline-flex items-center justify-center',
          'hover:bg-white/10 hover:text-white',
          'focus:outline-none focus:ring-1 focus:ring-white/20',
          'transition-colors',
        ),
        disabled: 'text-white/20 opacity-50',
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
          'text-white/30 aria-selected:bg-white/5 aria-selected:text-white/50',
        range_end: '',
        range_middle: 'aria-selected:bg-white/5 aria-selected:text-white/90',
        range_start: '',
        selected:
          'bg-white text-black hover:bg-white/90 hover:text-black focus:bg-white focus:text-black',
        today: 'bg-white/10 text-white',
        week: '',
        weekday: 'text-white/40 w-9 font-normal text-[0.8rem] text-center p-2',
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
