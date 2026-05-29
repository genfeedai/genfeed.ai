import { cva } from 'class-variance-authority';

export const stackVariants = cva('flex', {
  defaultVariants: {
    align: 'stretch',
    direction: 'column',
    gap: 4,
    justify: 'start',
    wrap: false,
  },
  variants: {
    align: {
      baseline: 'items-baseline',
      center: 'items-center',
      end: 'items-end',
      start: 'items-start',
      stretch: 'items-stretch',
    },
    direction: {
      column: 'flex-col',
      'column-reverse': 'flex-col-reverse',
      row: 'flex-row',
      'row-reverse': 'flex-row-reverse',
    },
    gap: {
      0: 'gap-0',
      1: 'gap-1',
      2: 'gap-2',
      3: 'gap-3',
      4: 'gap-4',
      5: 'gap-5',
      6: 'gap-6',
      8: 'gap-8',
      10: 'gap-10',
      12: 'gap-12',
    },
    justify: {
      around: 'justify-around',
      between: 'justify-between',
      center: 'justify-center',
      end: 'justify-end',
      evenly: 'justify-evenly',
      start: 'justify-start',
    },
    wrap: {
      false: 'flex-nowrap',
      true: 'flex-wrap',
    },
  },
});
