'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import type { ComponentProps } from 'react';
import { DayPicker } from 'react-day-picker';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2';

export type CalendarProps = ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn('p-3', className)}
      classNames={{
        button_next: cn(
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          'inline-flex items-center justify-center',
          'border border-white/[0.08] hover:border-white/20',
          'hover:bg-white/5 transition-colors',
        ),
        button_previous: cn(
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100',
          'inline-flex items-center justify-center',
          'border border-white/[0.08] hover:border-white/20',
          'hover:bg-white/5 transition-colors',
        ),
        caption_label: 'text-sm font-medium text-white/90',
        day: cn(
          'relative p-0 text-center text-sm focus-within:relative focus-within:z-20',
          'h-9 w-9',
          props.mode === 'range'
            ? '[&:has([aria-selected])]:bg-white/5 first:[&:has([aria-selected])]: last:[&:has([aria-selected])]:'
            : '[&:has([aria-selected])]: [&:has([aria-selected])]:bg-white/5',
        ),
        day_button: cn(
          'h-9 w-9 p-0 font-normal',
          'inline-flex items-center justify-center',
          'hover:bg-white/10 hover:text-white',
          'focus:outline-none focus:ring-1 focus:ring-white/20',
          'transition-colors',
        ),
        disabled: 'text-white/20 opacity-50',
        hidden: 'invisible',
        month: 'flex flex-col gap-4',
        month_caption: 'flex justify-center pt-1 relative items-center h-10',
        month_grid: 'w-full border-collapse',
        months: 'flex flex-col sm:flex-row gap-4',
        nav: 'flex items-center gap-1 absolute right-1 top-0 h-10',
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
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <HiChevronLeft className="h-4 w-4" />
          ) : (
            <HiChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
