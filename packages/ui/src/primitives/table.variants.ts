import { cva } from 'class-variance-authority';

/**
 * `sm` is the dense default for app panels. `md` is the roomier reading size
 * for static tables on marketing pages and agent blocks. Cell spacing is set
 * from the table so rows and cells never need padding classes.
 */
export const tableVariants = cva('w-full caption-bottom text-sm', {
  defaultVariants: { isStriped: false, size: 'sm' },
  variants: {
    isStriped: {
      false: '',
      true: '[&_tbody_tr:nth-child(odd)]:bg-card/50',
    },
    size: {
      md: '[&_td]:px-4 [&_td]:py-3 [&_th]:px-4 [&_thead_th]:h-10',
      sm: '',
    },
  },
});

const alignVariants = {
  center: 'text-center',
  left: 'text-left',
  right: 'text-right',
} as const;

export const tableHeadVariants = cva(
  'h-9 px-2 align-middle text-2xs font-medium uppercase tracking-wide [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
  {
    defaultVariants: {
      align: 'left',
      isSortable: false,
      tone: 'default',
      variant: 'column',
    },
    variants: {
      align: alignVariants,
      isSortable: {
        false: '',
        true: 'cursor-pointer select-none hover:text-foreground',
      },
      tone: {
        default: 'text-muted-foreground',
        highlight: 'bg-primary/10 text-muted-foreground',
        muted: 'text-muted-foreground',
      },
      /** `row` is the first cell of a body row (`scope="row"`): reads as text, not a column label. */
      variant: {
        column: '',
        row: 'h-auto py-3 text-sm font-medium normal-case tracking-normal text-foreground',
      },
    },
  },
);

export const tableCellVariants = cva(
  'px-2 py-2 align-middle text-xs [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
  {
    defaultVariants: { tone: 'default' },
    variants: {
      align: alignVariants,
      tone: {
        default: 'text-foreground',
        highlight: 'bg-primary/5 text-foreground',
        muted: 'text-foreground/70',
      },
    },
  },
);
